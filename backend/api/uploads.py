import os
import uuid
import shutil
import zipfile
import tempfile
import re
import io
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse

from api.notes import (
    _build_frontmatter, _sanitize_title, _parse_frontmatter,
    _collect_notes_recursive, NOTES_DIR, IMAGES_DIR, TZ,
)

router = APIRouter()

DATA_DIR = os.getenv("BEMO_DATA_DIR", "./data")
# IMAGES_DIR is now imported from notes.py for consistency


# ──────────────── Image Upload ────────────────

@router.post("/")
async def upload_image(file: UploadFile = File(...)):
    """Upload an image file and return its URL."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    ext = os.path.splitext(file.filename)[1]
    if not ext:
        ext = ".png"

    unique_filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(IMAGES_DIR, unique_filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "url": f"/images/{unique_filename}",
        "filename": unique_filename,
        "original_name": file.filename
    }


# ──────────────── Export: Native ZIP ────────────────

def _collect_referenced_images(notes_dir: str) -> set[str]:
    """Scan all notes and collect image filenames referenced via ![...](/images/xxx)."""
    referenced = set()
    img_pattern = re.compile(r'!\[.*?\]\(/images/([^)]+)\)')
    link_pattern = re.compile(r'\[.*?\]\(/images/([^)]+)\)')
    for root, _, files in os.walk(notes_dir):
        for fname in files:
            if not fname.endswith(".md"):
                continue
            try:
                with open(os.path.join(root, fname), "r", encoding="utf-8") as f:
                    content = f.read()
                for m in img_pattern.finditer(content):
                    referenced.add(m.group(1))
                for m in link_pattern.finditer(content):
                    referenced.add(m.group(1))
            except Exception:
                pass
    return referenced


@router.get("/export/zip")
async def export_zip():
    """Export all notes + referenced images as a native Bemo backup ZIP."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        # 1. Add all markdown notes preserving directory structure
        if os.path.exists(NOTES_DIR):
            for root, _, files in os.walk(NOTES_DIR):
                for fname in files:
                    if not fname.endswith(".md"):
                        continue
                    filepath = os.path.join(root, fname)
                    arcname = "notes/" + os.path.relpath(filepath, NOTES_DIR).replace("\\", "/")
                    zf.write(filepath, arcname)

        # 2. Add referenced images
        referenced = _collect_referenced_images(NOTES_DIR)
        if os.path.exists(IMAGES_DIR):
            for fname in os.listdir(IMAGES_DIR):
                fpath = os.path.join(IMAGES_DIR, fname)
                if os.path.isfile(fpath) and fname in referenced:
                    zf.write(fpath, f"images/{fname}")

    buf.seek(0)
    now_str = datetime.now(TZ).strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="bemo_backup_{now_str}.zip"'}
    )


# ──────────────── Export: Flomo HTML ────────────────

_FLOMO_HTML_TEMPLATE = """
    <html>
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <title>Bemo Export · Flomo Format</title>
        <style type="text/css">
          * {{ margin: 0; padding: 0; }}
          body {{ background: #fafafa; }}
          header .logo {{ text-align: center; border-bottom: 1px solid #efefef; padding: 40px 0; }}
          header, .memos {{ width: 600px; margin: 0 auto; }}
          .memo {{ margin: 20px 0; background: #fff; padding: 20px; border-radius: 6px; word-wrap: break-word; }}
          .memo:hover {{ box-shadow: 0px 2px 10px #dddddd; }}
          .memo .time {{ color: #8d8d8d; font-size: 12px; }}
          .memo .content {{ color: #323232; font-size: 14px; }}
          .memo .content p {{ line-height: 1.8; min-height: 20px; margin: 0; }}
          .memo .content ul, .memo .content ol {{ padding-inline-start: 22px; margin: 0; }}
          .memo .content li {{ line-height: 1.8; }}
          .memo .files img {{ max-width: 100%; border: 1px solid #e6e6e6; border-radius: 4px; margin: 6px 0; }}
        </style>
      </head>
      <body>
        <header>
          <div class="logo"><strong>Bemo Notes</strong></div>
          <div style="text-align:center; padding: 20px 0;">
            <div style="color:#454545; font-size:16px;">Bemo Export</div>
            <div style="font-size:12px; color:#9d9d9d;">于 {export_date} 导出 {count} 条 MEMO</div>
          </div>
        </header>
        <div class="memos">
{memos_html}
        </div>
      </body>
    </html>"""


def _markdown_to_flomo_html(md_content: str) -> str:
    """Convert simple Markdown text back to Flomo-style HTML content."""
    lines = md_content.split("\n")
    html_parts = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Unordered list
        if line.strip().startswith("- "):
            items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append(f"<li>{lines[i].strip()[2:]}</li>")
                i += 1
            html_parts.append("<ul>" + "".join(items) + "</ul>")
            continue
        # Ordered list
        ol_match = re.match(r'^\d+\.\s', line.strip())
        if ol_match:
            items = []
            while i < len(lines) and re.match(r'^\d+\.\s', lines[i].strip()):
                text = re.sub(r'^\d+\.\s', '', lines[i].strip())
                items.append(f"<li>{text}</li>")
                i += 1
            html_parts.append("<ol>" + "".join(items) + "</ol>")
            continue
        # Skip image markdown lines (handled separately in files div)
        if line.strip().startswith("!["):
            i += 1
            continue
        # Normal paragraph
        text = line.strip()
        if text:
            html_parts.append(f"<p>{text}</p>")
        i += 1
    return "".join(html_parts)


@router.get("/export/flomo")
async def export_flomo():
    """Export all notes as a Flomo-compatible HTML inside a ZIP."""
    all_notes = _collect_notes_recursive(NOTES_DIR)
    all_notes.sort(key=lambda x: -x["created_at"])

    memos_parts = []
    image_files = []  # (arcname_in_zip, local_path)

    for note in all_notes:
        # Format time
        dt = datetime.fromtimestamp(note["created_at"], tz=TZ)
        time_str = dt.strftime("%Y-%m-%d %H:%M:%S")

        content = note.get("content", "") or ""
        html_content = _markdown_to_flomo_html(content)

        # Extract image references
        files_html = ""
        img_pattern = re.compile(r'!\[.*?\]\(/images/([^)]+)\)')
        for m in img_pattern.finditer(content):
            img_name = m.group(1)
            local_path = os.path.join(IMAGES_DIR, img_name)
            if os.path.exists(local_path):
                files_html += f'<img src="file/{img_name}" />\n'
                image_files.append((f"file/{img_name}", local_path))

        memo_html = f"""    <div class="memo">
      <div class="time">{time_str}</div>
      <div class="content">{html_content}</div>
      <div class="files">
        {files_html}
      </div>
    </div>
  """
        memos_parts.append(memo_html)

    export_date = datetime.now(TZ).strftime("%Y-%m-%d")
    full_html = _FLOMO_HTML_TEMPLATE.format(
        export_date=export_date,
        count=len(all_notes),
        memos_html="\n".join(memos_parts),
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("bemo_export/笔记.html", full_html)
        seen = set()
        for arcname, local_path in image_files:
            if arcname not in seen:
                zf.write(local_path, f"bemo_export/{arcname}")
                seen.add(arcname)

    buf.seek(0)
    now_str = datetime.now(TZ).strftime("%Y%m%d_%H%M%S")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="bemo_flomo_{now_str}.zip"'}
    )


# ──────────────── Import: Native ZIP ────────────────

@router.post("/zip")
async def import_zip(file: UploadFile = File(...)):
    """Import a native Bemo backup ZIP (notes/*.md + images/*)."""
    if not file.filename.lower().endswith('.zip'):
        raise HTTPException(status_code=400, detail="Must be a .zip file")

    with tempfile.TemporaryDirectory() as temp_dir:
        zip_path = os.path.join(temp_dir, "upload.zip")
        with open(zip_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid zip file")

        imported_notes = 0
        imported_images = 0

        # Restore notes
        extracted_notes = os.path.join(temp_dir, "notes")
        if os.path.isdir(extracted_notes):
            for root, _, files in os.walk(extracted_notes):
                for fname in files:
                    if not fname.endswith(".md"):
                        continue
                    src = os.path.join(root, fname)
                    rel = os.path.relpath(src, extracted_notes).replace("\\", "/")
                    dest = os.path.join(NOTES_DIR, rel)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    if not os.path.exists(dest):
                        shutil.copy2(src, dest)
                        imported_notes += 1

        # Restore images
        extracted_images = os.path.join(temp_dir, "images")
        if os.path.isdir(extracted_images):
            for fname in os.listdir(extracted_images):
                src = os.path.join(extracted_images, fname)
                if not os.path.isfile(src):
                    continue
                dest = os.path.join(IMAGES_DIR, fname)
                if not os.path.exists(dest):
                    shutil.copy2(src, dest)
                    imported_images += 1

    return {
        "message": "Success",
        "imported_notes": imported_notes,
        "imported_images": imported_images,
    }


# ──────────────── Import: Flomo ZIP ────────────────

def _parse_flomo_content(content_el) -> str:
    """Safely convert flomo HTML content to Markdown-like plaintext."""
    if not content_el:
        return ""

    parts = []

    for child in content_el.children:
        name = getattr(child, 'name', None)
        if not name:
            text = str(child).strip()
            if text:
                parts.append(text + "\n\n")
            continue

        if name == 'p':
            parts.append(child.get_text(separator=' ', strip=True) + "\n\n")
        elif name == 'ul':
            for li in child.find_all('li', recursive=False):
                parts.append("- " + li.get_text(separator=' ', strip=True) + "\n")
            parts.append("\n")
        elif name == 'ol':
            for i, li in enumerate(child.find_all('li', recursive=False)):
                parts.append(f"{i+1}. " + li.get_text(separator=' ', strip=True) + "\n")
            parts.append("\n")
        else:
            text = child.get_text(separator=' ', strip=True)
            if text:
                parts.append(text + "\n\n")

    return "".join(parts).strip()


def _extract_tags_from_text(text: str) -> list[str]:
    """Find hashtags like #tag in the text."""
    tags = set(re.findall(r'#([^\s#]+)', text))
    return sorted(list(tags))


@router.post("/flomo")
async def import_flomo(file: UploadFile = File(...)):
    """Import notes from Flomo ZIP export."""
    if not file.filename.lower().endswith('.zip'):
        raise HTTPException(status_code=400, detail="Must be a .zip file")

    with tempfile.TemporaryDirectory() as temp_dir:
        zip_path = os.path.join(temp_dir, "upload.zip")
        with open(zip_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid zip file")

        # Find HTML file in the unzipped contents
        html_files = []
        for root, _, files in os.walk(temp_dir):
            for filename in files:
                if filename.lower().endswith('.html'):
                    html_files.append(os.path.join(root, filename))

        if not html_files:
            raise HTTPException(status_code=400, detail="No HTML file found in zip")

        html_path = html_files[0]
        html_root = os.path.dirname(html_path)

        with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')

        memos = soup.find_all('div', class_='memo')
        imported_count = 0

        for memo in memos:
            # 1. Parse creation time
            time_el = memo.find('div', class_='time')
            created_at = datetime.now(TZ)
            if time_el:
                time_str = time_el.get_text(strip=True)
                try:
                    parsed_time = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
                    created_at = parsed_time.replace(tzinfo=TZ)
                except ValueError:
                    pass

            # 2. Extract content
            content_el = memo.find('div', class_='content')
            content_text = _parse_flomo_content(content_el)

            # Append audio transcripts if they exist
            audio_texts = []
            for audio_content in memo.find_all('div', class_='audio-player__content'):
                audio_texts.append(audio_content.get_text(strip=True))
            if audio_texts:
                content_text += "\n\n" + "\n\n".join(audio_texts)

            tags = _extract_tags_from_text(content_text)

            # 3. Extract attachments
            files_el = memo.find('div', class_='files')
            if files_el:
                for img in files_el.find_all('img'):
                    src = img.get('src')
                    if src:
                        src = src.split('?')[0].split('#')[0]
                        local_path = os.path.normpath(os.path.join(html_root, src))
                        if os.path.exists(local_path):
                            ext = os.path.splitext(local_path)[1] or '.png'
                            unique_name = f"{uuid.uuid4().hex}{ext}"
                            dest_path = os.path.join(IMAGES_DIR, unique_name)
                            shutil.copy2(local_path, dest_path)
                            content_text += f"\n\n![image](/images/{unique_name})"

                for tag_name, placeholder in [('audio', '音频附件'), ('a', '文件附件')]:
                    for media in files_el.find_all(tag_name):
                        target_attr = 'href' if tag_name == 'a' else 'src'
                        src = media.get(target_attr)
                        if src and not src.startswith('http') and not src.startswith('data:'):
                            src = src.split('?')[0].split('#')[0]
                            local_path = os.path.normpath(os.path.join(html_root, src))
                            if os.path.exists(local_path):
                                ext = os.path.splitext(local_path)[1] or '.bin'
                                unique_name = f"{uuid.uuid4().hex}{ext}"
                                dest_path = os.path.join(IMAGES_DIR, unique_name)
                                shutil.copy2(local_path, dest_path)
                                content_text += f"\n\n[{placeholder}](/images/{unique_name})"

            if not content_text.strip():
                continue

            # 4. Save to filesystem
            timestamp = int(created_at.timestamp())
            date_dir = created_at.strftime("%Y/%m/%d")
            target_dir = os.path.join(NOTES_DIR, date_dir)
            os.makedirs(target_dir, exist_ok=True)

            first_line = content_text.strip().split("\n")[0][:20].strip()
            if first_line.startswith("#"):
                first_line = first_line.lstrip("#").strip()
            title = _sanitize_title(first_line) if first_line else "untitled"

            filename = f"{timestamp}_{title}.md"
            filepath = os.path.join(target_dir, filename)

            frontmatter = _build_frontmatter(created_at.isoformat(), tags, False)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(frontmatter + content_text.strip() + "\n")

            os.utime(filepath, (timestamp, timestamp))
            imported_count += 1

    return {"message": "Success", "imported_count": imported_count}

