import sys

# Read the file
with open('src/hooks/useTimeline.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The new function to insert
new_function = '''
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

'''

# Fix line 564 (index 564) - change 'EDL Export failed' to 'XML Export failed'
if 'EDL Export failed' in lines[564]:
    lines[564] = lines[564].replace('EDL Export failed', 'XML Export failed')

# Insert the new function after line 567 (index 567)
lines.insert(568, new_function)

# Write back
with open('src/hooks/useTimeline.ts', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('✅ Successfully added exportToEDL function!')
