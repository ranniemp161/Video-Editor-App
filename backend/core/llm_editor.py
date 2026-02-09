
import os
import json
import logging
from typing import List, Dict
import google.generativeai as genai

logger = logging.getLogger(__name__)

class LLMEditor:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.model = None
        
        if self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel('gemini-2.0-flash')
                logger.info("LLMEditor initialized with Gemini 2.0 Flash.")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini API: {e}")
        else:
            logger.warning("GEMINI_API_KEY not found in environment. LLM filtering will be skipped.")

    def identify_fluff(self, segments: List[Dict]) -> List[int]:
        """
        Send a batch of segments to Gemini to identify which ones should be CUT.
        Returns a list of segment indices to discard.
        """
        if not self.model or not segments:
            return []

        # 1. Format segments for prompt
        # We send ID and TEXT to minimize token usage
        formatted_segments = []
        for i, seg in enumerate(segments):
            formatted_segments.append({
                "id": i,
                "text": seg['text']
            })

        prompt = f"""
You are an expert video editor performing a 'Rough Cut' on a transcript.
Your mission is to identify segments that are 'Fluff'—this includes:
1. Low-value tangents (off-topic stories or comments).
2. Redundant re-phrasings that don't add new information.
3. Weak transitions or meta-commentary (e.g., "So then I thought...", "Checking my notes...").
4. Filler that feels like a 'False Start' or 'Broken Thought'.

CONTEXT (Topic of the video): General user-provided content.

INSTRUCTIONS:
- Analyze the segments provided in the JSON list.
- Compare them to each other to find redundancies.
- Return ONLY a JSON list of IDs that should be CUT.
- If a segment is valuable or starts a new important point, KEEP it.
- If unsure, KEEP it (Safety First).

SEGMENTS:
{json.dumps(formatted_segments, indent=2)}

OUTPUT FORMAT:
[id1, id2, ...]
"""

        try:
            response = self.model.generate_content(prompt)
            # Parse response (cleaning up markdown if necessary)
            text_response = response.text.strip()
            # Remove markdown backticks if present
            if text_response.startswith("```"):
                text_response = re.sub(r"```json|```", "", text_response).strip()
            
            discard_ids = json.loads(text_response)
            if isinstance(discard_ids, list):
                logger.info(f"LLM Semantic filtering identified {len(discard_ids)} fluff segments.")
                return discard_ids
            else:
                logger.warning(f"LLM returned invalid format: {text_response}")
                return []
        except Exception as e:
            logger.error(f"LLM semantic pass failed: {e}")
            return []

    def get_fluff_stats(self):
        """Returns metadata about LLM usage if needed."""
        return {}
