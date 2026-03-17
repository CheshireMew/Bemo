import re


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

_IMAGE_ATTACHMENT_LINE = re.compile(r"^!\[.*?\]\(/images/([^)]+)\)$")
_FILE_ATTACHMENT_LINE = re.compile(r"^\[.*?\]\(/images/([^)]+)\)$")


def get_flomo_html_template() -> str:
    return _FLOMO_HTML_TEMPLATE


def markdown_to_flomo_html(md_content: str) -> str:
    lines = md_content.split("\n")
    html_parts = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("- "):
            items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append(f"<li>{lines[i].strip()[2:]}</li>")
                i += 1
            html_parts.append("<ul>" + "".join(items) + "</ul>")
            continue

        if re.match(r"^\d+\.\s", line.strip()):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s", lines[i].strip()):
                text = re.sub(r"^\d+\.\s", "", lines[i].strip())
                items.append(f"<li>{text}</li>")
                i += 1
            html_parts.append("<ol>" + "".join(items) + "</ol>")
            continue

        if _IMAGE_ATTACHMENT_LINE.match(line.strip()) or _FILE_ATTACHMENT_LINE.match(line.strip()):
            i += 1
            continue

        text = line.strip()
        if text:
            html_parts.append(f"<p>{text}</p>")
        i += 1

    return "".join(html_parts)


def parse_flomo_content(content_el) -> str:
    if not content_el:
        return ""

    parts = []
    for child in content_el.children:
        name = getattr(child, "name", None)
        if not name:
            text = str(child).strip()
            if text:
                parts.append(text + "\n\n")
            continue

        if name == "p":
            parts.append(child.get_text(separator=" ", strip=True) + "\n\n")
        elif name == "ul":
            for li in child.find_all("li", recursive=False):
                parts.append("- " + li.get_text(separator=" ", strip=True) + "\n")
            parts.append("\n")
        elif name == "ol":
            for index, li in enumerate(child.find_all("li", recursive=False), start=1):
                parts.append(f"{index}. " + li.get_text(separator=' ', strip=True) + "\n")
            parts.append("\n")
        else:
            text = child.get_text(separator=" ", strip=True)
            if text:
                parts.append(text + "\n\n")

    return "".join(parts).strip()


def extract_tags_from_text(text: str) -> list[str]:
    tags = set(re.findall(r"#([^\s#]+)", text))
    return sorted(list(tags))
