import os
import re
import sys
from pathlib import Path

def slugify(heading: str) -> str:
    # GitHub markdown anchor generation
    # remove leading # and whitespace
    h = heading.strip().lstrip('#').strip()
    # remove inline links [text](url) -> text
    h = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', h)
    # remove html tags
    h = re.sub(r'<[^>]+>', '', h)
    # lowercase
    h = h.lower()
    # strip characters that are not alphanumeric, whitespace, hyphen, or underscore
    h = re.sub(r'[^\w\s\-]', '', h)
    # replace whitespace with hyphen
    h = re.sub(r'\s', '-', h)
    return h

def extract_anchors(file_path: Path):
    anchors = set()
    slug_counts = {}
    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        return anchors, content, f"Error reading file: {e}"

    lines = content.splitlines()
    for line in lines:
        # Check explicit html anchor <a id="..." or <a name="..."
        for match in re.finditer(r'<a\s+[^>]*(?:id|name)=["\']([^"\']+)["\']', line, re.IGNORECASE):
            anchors.add(match.group(1).lower())
            anchors.add(match.group(1))

        # Check markdown headings # Heading
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
        if heading_match:
            raw_title = heading_match.group(2).strip()
            slug = slugify(raw_title)
            # GitHub duplicate anchor resolution
            if slug in slug_counts:
                slug_counts[slug] += 1
                unique_slug = f"{slug}-{slug_counts[slug]}"
            else:
                slug_counts[slug] = 0
                unique_slug = slug
            anchors.add(unique_slug)
            anchors.add(slug)
            # Also add variant where multiple hyphens are collapsed
            collapsed = re.sub(r'-+', '-', slug)
            anchors.add(collapsed)

    return anchors, content, None

def find_md_files(root_dir: Path):
    md_files = []
    for p in root_dir.rglob("*.md"):
        # Skip node_modules or .git if any
        if "node_modules" in p.parts or ".git" in p.parts:
            continue
        md_files.append(p)
    return md_files

def audit_links(project_root: Path):
    md_files = find_md_files(project_root)
    print(f"Discovered {len(md_files)} markdown files in {project_root}")

    # Cache anchors for each file
    file_anchors = {}
    file_contents = {}
    for mf in md_files:
        anchors, content, err = extract_anchors(mf)
        if err:
            print(f"Warning: {mf}: {err}")
        file_anchors[mf.resolve()] = anchors
        file_contents[mf.resolve()] = content

    link_pattern = re.compile(r'\[([^\]]*)\]\(([^)]+)\)')
    issues = []

    for mf in md_files:
        content = file_contents[mf.resolve()]
        lines = content.splitlines()
        for line_num, line in enumerate(lines, 1):
            # find markdown links
            for match in link_pattern.finditer(line):
                text, target = match.groups()
                target = target.strip()

                # Ignore external links, mailto, etc.
                if target.startswith(("http://", "https://", "mailto:", "ftp://")):
                    continue
                # Ignore empty target
                if not target:
                    continue

                # Parse file and anchor
                parts = target.split('#', 1)
                file_part = parts[0]
                anchor_part = parts[1] if len(parts) > 1 else None

                # Determine target file path
                if not file_part:
                    # Same-file anchor
                    target_file = mf.resolve()
                elif file_part.startswith("file:///"):
                    raw_path = file_part[8:]
                    # Handle windows drive letters e.g. /D:/... or D:/...
                    if raw_path.startswith('/') and len(raw_path) > 2 and raw_path[2] == ':':
                        raw_path = raw_path[1:]
                    target_file = Path(raw_path).resolve()
                elif file_part.startswith("file://"):
                    raw_path = file_part[7:]
                    if raw_path.startswith('/') and len(raw_path) > 2 and raw_path[2] == ':':
                        raw_path = raw_path[1:]
                    target_file = Path(raw_path).resolve()
                else:
                    target_path = (mf.parent / file_part).resolve()
                    target_file = target_path


                # Check if target file exists
                if not target_file.exists():
                    issues.append({
                        "source_file": mf,
                        "line": line_num,
                        "link_text": text,
                        "target": target,
                        "error": f"Target file does not exist: {target_file}"
                    })
                    continue

                # If it's a markdown file and has an anchor, check anchor validity
                if anchor_part is not None:
                    # Clean anchor (remove potential quotes or whitespace)
                    clean_anchor = anchor_part.strip().lstrip('#')
                    anchors = file_anchors.get(target_file)
                    if anchors is None:
                        # Extract anchors for this file if not already cached
                        anchors, _, _ = extract_anchors(target_file)
                        file_anchors[target_file] = anchors

                    anchor_lower = clean_anchor.lower()
                    collapsed_lower = re.sub(r'-+', '-', anchor_lower)

                    if clean_anchor not in anchors and anchor_lower not in anchors and collapsed_lower not in anchors:
                        issues.append({
                            "source_file": mf,
                            "line": line_num,
                            "link_text": text,
                            "target": target,
                            "error": f"Anchor '#{clean_anchor}' not found in {target_file.name}",
                            "available_anchors": sorted(list(anchors))[:15]
                        })

    return issues

if __name__ == "__main__":
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    script_dir = Path(__file__).resolve().parent
    project_root = (script_dir / ".." / ".." / "..").resolve()
    print(f"Project root: {project_root}")
    issues = audit_links(project_root)

    print(f"\n==========================================")
    print(f"Total issues found: {len(issues)}")
    print(f"==========================================")

    import json
    json_issues = []
    for issue in issues:
        json_issues.append({
            "source_file": str(issue['source_file'].relative_to(project_root)),
            "line": issue['line'],
            "link_text": issue['link_text'],
            "target": issue['target'],
            "error": issue['error'],
            "available_anchors": issue.get('available_anchors', [])
        })

    out_file = script_dir / "md_link_issues.json"
    out_file.write_text(json.dumps(json_issues, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"Wrote full issue report to {out_file}")

    from collections import defaultdict
    grouped = defaultdict(list)
    for it in issues:
        rel_src = str(it['source_file'].relative_to(project_root))
        grouped[rel_src].append(it)

    print("\n=== GROUPED BY FILE ===")
    for f, items in sorted(grouped.items()):
        print(f"\n--- {f} ({len(items)} errors) ---")
        for it in items:
            print(f"  Line {it['line']}: [{it['link_text']}]({it['target']}) -> {it['error']}")

    sys.exit(0 if len(issues) == 0 else 1)



