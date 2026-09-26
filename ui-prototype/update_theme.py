import os
import re

html_files = [
    'index.html', 'dashboard.html', 'settings-filters.html',
    'pr-hub.html', 'workflow-alerts.html', 'repository-detail.html',
    'github-project-control-launcher.html'
]

for filename in html_files:
    if not os.path.exists(filename):
        continue

    with open(filename, 'r') as f:
        content = f.read()

    # Only modify if not already updated
    if 'theme-toggle' in content:
        print(f"Skipping {filename} - already updated")
        continue

    # Remove duplicate theme.js script if it exists
    content = re.sub(r'\s*<script src="theme\.js"><\/script>\n', '', content)

    # Add theme toggle button before Connect GitHub button
    pattern = r'(<button class="btn btn-primary">Connect GitHub</button>)'
    content = re.sub(pattern, replacement, content)    replacement = r'<button class="theme-toggle" title="Toggle dark mode">

    # Add theme.js script at end
    pattern = r'</body>'
    replacement = r'  <script src="theme.js"></script>\n</body>'
    content = re.sub(pattern, replacement, content)

    with open(filename, 'w') as f:
        f.write(content)

    print(f"Updated {filename}")

print("\nAll files updated with theme support!")
