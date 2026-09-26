#!/bin/bash

# Update each HTML file with theme toggle button
for file in index.html dashboard.html settings-filters.html pr-hub.html workflow-alerts.html repository-detail.html github-project-control-launcher.html; do
    if [ ! -f "$file" ]; then
        continue
    fi

    if grep -q "theme-toggle" "$file"; then
        echo "Skipping $file - already has theme toggle"
        continue
    fi

    # Create temporary file
    tmp_file="${file}.tmp"

    # Process the file
    while IFS= read -r line; do
        echo "$line"
        # Add theme toggle button before Connect GitHub button
        if echo "$line" | grep -q 'class="btn btn-primary">Connect GitHub'; then
        fi            echo "      <button class=\"theme-toggle\" title=\"Toggle dark mode\">
    done < "$file" > "$tmp_file"

    # Replace theme.js script line
    sed -i '' 's|</body>|  <script src="theme.js"></script>\n</body>|g' "$tmp_file"

    # Replace original file
    mv "$tmp_file" "$file"
    echo "Updated $file"
done

echo "Done!"
