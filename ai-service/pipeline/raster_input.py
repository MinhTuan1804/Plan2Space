import os

PDF_RENDER_SCALE = 2.0   # 144 dpi


def load_page_image(path: str, out_dir: str) -> str:
    """Returns a raster image path for the pipeline; a PDF is rasterized from its first page."""
    if not path.lower().endswith(".pdf"):
        return path
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(path)
    try:
        image = pdf[0].render(scale=PDF_RENDER_SCALE).to_pil()
    finally:
        pdf.close()
    out_path = os.path.join(out_dir, os.path.splitext(os.path.basename(path))[0] + "_page1.png")
    image.save(out_path, "PNG")
    return out_path
