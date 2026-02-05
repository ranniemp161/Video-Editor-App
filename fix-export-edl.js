const fs = require('fs');

const filePath = 'src/hooks/useTimeline.ts';
const content = fs.readFileSync(filePath, 'utf8');

// Split into lines
const lines = content.split('\n');

// Find line 567 (index 566) and insert the new function after it
const insertIndex = 567; // After line 567

const newFunction = `
  const exportToEDL = useCallback(async () => {
    const data = {
      timeline,
      assets: assets.map(a => ({
        id: a.id,
        name: a.name,
        duration: a.duration,
        src: a.remoteSrc || a.src
      }))
    };

    try {
      const response = await fetch('/api/export-edl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result.success) {
        // Trigger download
        const link = document.createElement('a');
        link.href = result.path;
        link.download = basename(result.path);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('EDL Export failed:', err);
    }
  }, [timeline, assets]);
`;

// Also fix line 564 (index 564) to say 'XML Export failed' instead of 'EDL Export failed'
lines[564] = lines[564].replace('EDL Export failed', 'XML Export failed');

// Insert the new function
lines.splice(insertIndex, 0, newFunction);

// Write back
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

console.log('Successfully added exportToEDL function!');
