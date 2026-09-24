import os

from PIL import Image, ImageOps

PDF_RENDER_SCALE = 2.0   # 144 dpi


def load_page_image(path: str, out_dir: str) -> str:
    """Returns a raster image path for the pipeline; a PDF is rasterized from its first page."""
    if not path.lower().endswith(".pdf"):
        return _upright(path, out_dir)
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(path)
    try:
        image = pdf[0].render(scale=PDF_RENDER_SCALE).to_pil()
    finally:
        pdf.close()
    out_path = os.path.join(out_dir, os.path.splitext(os.path.basename(path))[0] + "_page1.png")
    image.save(out_path, "PNG")
    return out_path


EXIF_ORIENTATION = 0x0112


def _upright(path: str, out_dir: str) -> str:
    """Phone photos store their rotation as an EXIF tag that browsers apply when showing them. Apply it here
    too, so the traced walls line up with the image the editor draws under the plan."""
    with Image.open(path) as img:
        if img.getexif().get(EXIF_ORIENTATION, 1) == 1:
            return path
        upright = ImageOps.exif_transpose(img)
    out_path = os.path.join(out_dir, os.path.splitext(os.path.basename(path))[0] + "_upright.png")
    upright.save(out_path, "PNG")
    return out_path
