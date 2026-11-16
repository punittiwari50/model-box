import sys
import re
import os
import pathlib

sys.stdout.reconfigure(encoding='utf-8')

def slugify(text: str) -> str:
    h = text.strip().lstrip('#').strip()
    h = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', h)
    h = re.sub(r'<[^>]+>', '', h)
    h = h.lower()
    h = re.sub(r'[^\w\s\-]', '', h)
    h = re.sub(r'\s', '-', h)
    return h

def extract_headings_and_anchors(file_path: pathlib.Path):
    text = file_path.read_text(encoding='utf-8')
    headings = [] # (slug, collapsed_slug, raw_title, line_no)
    explicit_anchors = {}
    slug_counts = {}

    lines = text.splitlines()
    for idx, line in enumerate(lines, 1):
        for m in re.finditer(r'<a\s+[^>]*(?:id|name)=["\']([^"\']+)["\']', line, re.IGNORECASE):
            tag = m.group(1)
            explicit_anchors[tag.lower()] = (tag, idx)
            explicit_anchors[tag] = (tag, idx)

        m = re.match(r'^(#{1,6})\s+(.+)$', line)
        if m:
            raw_title = m.group(2).strip()
            slug = slugify(raw_title)
            if slug in slug_counts:
                slug_counts[slug] += 1
                unique_slug = f"{slug}-{slug_counts[slug]}"
            else:
                slug_counts[slug] = 0
                unique_slug = slug
            collapsed = re.sub(r'-+', '-', slug)
            headings.append((unique_slug, collapsed, raw_title, idx))

    return text, headings, explicit_anchors

cached_files = {}

def get_file_data(path: pathlib.Path):
    res = path.resolve()
    if res not in cached_files:
        if not res.exists():
            return None
        cached_files[res] = extract_headings_and_anchors(res)
    return cached_files[res]

def normalize_digits(s: str) -> str:
    return re.sub(r'[^0-9]', '', s)

def audit_directory(dir_path: pathlib.Path):
    print(f"\n========================================================")
    print(f"AUDITING: {dir_path}")
    print(f"========================================================")
    
    issues = []
    usecase_files = sorted(dir_path.glob("*.md"))

    for uf in usecase_files:
        text, _, _ = get_file_data(uf)
        matches = list(re.finditer(r'\[([^\]]+)\]\(([^)]+)\)', text))

        for m in matches:
            txt = m.group(1).strip()
            target = m.group(2).strip()
            pos = m.start()
            line_no = text[:pos].count('\n') + 1

            if target.startswith("http") or target.startswith("mailto"):
                continue

            parts = target.split('#', 1)
            f_part = parts[0]
            a_part = parts[1] if len(parts) > 1 else None

            # Check if internal navigation within usecase folder uses '../usecase/'
            if "../usecase/" in f_part:
                issues.append({
                    "file": uf.name,
                    "line": line_no,
                    "type": "IMPROPER_PATH",
                    "link_text": txt,
                    "target": target,
                    "detail": f"Redundant '../usecase/' in link target path within usecase folder"
                })

            if not f_part:
                target_path = uf
            else:
                target_path = uf.parent / f_part

            t_data = get_file_data(target_path)
            if not t_data:
                issues.append({
                    "file": uf.name,
                    "line": line_no,
                    "type": "FILE_NOT_FOUND",
                    "link_text": txt,
                    "target": target,
                    "detail": f"Target file does not exist: {target_path}"
                })
                continue

            _, t_headings, t_explicit = t_data

            if a_part:
                clean_anchor = a_part.strip().lstrip('#').lower()
                clean_collapsed = re.sub(r'-+', '-', clean_anchor)

                matched_heading = None
                for u_slug, c_slug, raw_title, h_line in t_headings:
                    if clean_anchor in (u_slug, c_slug) or clean_collapsed in (u_slug, c_slug):
                        matched_heading = (raw_title, h_line)
                        break

                if not matched_heading and (a_part in t_explicit or clean_anchor in t_explicit):
                    tag_name, tag_line = t_explicit.get(a_part) or t_explicit.get(clean_anchor)
                    for u_slug, c_slug, raw_title, h_line in t_headings:
                        if h_line >= tag_line:
                            matched_heading = (f"<tag {tag_name}> {raw_title}", h_line)
                            break
                    if not matched_heading:
                        matched_heading = (f"<tag {tag_name}>", tag_line)

                if not matched_heading:
                    issues.append({
                        "file": uf.name,
                        "line": line_no,
                        "type": "MISSING_ANCHOR",
                        "link_text": txt,
                        "target": target,
                        "detail": f"Anchor '{a_part}' not found in {target_path.name}"
                    })
                else:
                    target_title, h_line = matched_heading
                    
                    # 1. Check if section numbers in text match section number in target title
                    sec_txt_match = re.search(r'§\s*([\d\.]+)', txt)
                    sec_tgt_match = re.search(r'^(\d+(?:\.\d+)*)', target_title.lstrip('#').strip())
                    
                    if sec_txt_match and sec_tgt_match:
                        txt_sec_norm = normalize_digits(sec_txt_match.group(1))
                        tgt_sec_norm = normalize_digits(sec_tgt_match.group(1))
                        if txt_sec_norm != tgt_sec_norm:
                            issues.append({
                                "file": uf.name,
                                "line": line_no,
                                "type": "SEMANTIC_SECTION_MISMATCH",
                                "link_text": txt,
                                "target": target,
                                "detail": f"Link text specifies §{sec_txt_match.group(1)} but target heading at line {h_line} is '{target_title}'"
                            })

                    # 2. Check if anchor slug specifies a section number that doesn't match target title
                    sec_anchor_match = re.match(r'^(\d+)-', a_part)
                    if sec_anchor_match and sec_tgt_match:
                        anc_sec_digits = sec_anchor_match.group(1)
                        tgt_sec_digits = normalize_digits(sec_tgt_match.group(1))
                        if not tgt_sec_digits.startswith(anc_sec_digits) and not anc_sec_digits.startswith(tgt_sec_digits):
                            issues.append({
                                "file": uf.name,
                                "line": line_no,
                                "type": "ANCHOR_HEADING_MISMATCH",
                                "link_text": txt,
                                "target": target,
                                "detail": f"Anchor slug section digits '{anc_sec_digits}' mismatch target heading digits '{tgt_sec_digits}' ('{target_title}')"
                            })

    print(f"Found {len(issues)} real issues in {dir_path}:")
    for i in issues:
        print(f"  [{i['type']}] {i['file']}:L{i['line']} '{i['link_text']}' -> '{i['target']}'")
        print(f"       => {i['detail']}")

    return issues

i1 = audit_directory(pathlib.Path("docs/usecase"))
i2 = audit_directory(pathlib.Path("config/docs/usecase"))
