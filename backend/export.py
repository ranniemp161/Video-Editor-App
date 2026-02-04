from typing import List, Dict
import xml.etree.ElementTree as ET

def generate_xml(segments: List[Dict], output_path: str, framerate=24):
    """
    Generates an FCP XML file from the segments.
    Only includes segments where isDeleted is False.
    """
    root = ET.Element("xmeml", version="4")
    project = ET.SubElement(root, "project")
    name = ET.SubElement(project, "name")
    name.text = "Gling Export"
    
    children = ET.SubElement(project, "children")
    sequence = ET.SubElement(children, "sequence")
    seq_name = ET.SubElement(sequence, "name")
    seq_name.text = "Rough Cut"
    
    rate = ET.SubElement(sequence, "rate")
    timebase = ET.SubElement(rate, "timebase")
    timebase.text = str(framerate)
    ntsc = ET.SubElement(rate, "ntsc")
    ntsc.text = "FALSE"
    
    media = ET.SubElement(sequence, "media")
    video = ET.SubElement(media, "video")
    track = ET.SubElement(video, "track")
    
    timeline_frame = 0
    
    for i, seg in enumerate(segments):
        if seg.get("isDeleted"):
            continue
            
        start_time = seg["start"]
        end_time = seg["end"]
        duration = end_time - start_time
        
        start_frame = int(start_time * framerate)
        end_frame = int(end_time * framerate)
        duration_frames = int(duration * framerate)
        
        clipitem = ET.SubElement(track, "clipitem", id=f"clipitem-{i}")
        name = ET.SubElement(clipitem, "name")
        name.text = seg.get("text", "Clip")
        
        dur = ET.SubElement(clipitem, "duration")
        dur.text = str(duration_frames)
        
        rate_item = ET.SubElement(clipitem, "rate")
        tb = ET.SubElement(rate_item, "timebase")
        tb.text = str(framerate)
        
        start_tag = ET.SubElement(clipitem, "start")
        start_tag.text = str(timeline_frame)
        
        end_tag = ET.SubElement(clipitem, "end")
        end_tag.text = str(timeline_frame + duration_frames)
        
        in_tag = ET.SubElement(clipitem, "in")
        in_tag.text = str(start_frame)
        
        out_tag = ET.SubElement(clipitem, "out")
        out_tag.text = str(end_frame)
        
        # Increment timeline position
        timeline_frame += duration_frames
        
    tree = ET.ElementTree(root)
    tree.write(output_path, encoding="UTF-8", xml_declaration=True)
    return output_path
