import pdfParse from 'pdf-parse';

export async function parseFile(buffer, mimetype, filename) {
  if (mimetype === 'application/pdf') {
    return parsePdf(buffer, filename);
  }
  const text = buffer.toString('utf-8');
  return [{ content: text, page: 1 }];
}

async function parsePdf(buffer, filename) {
  const data = await pdfParse(buffer);
  const pages = [];

  // pdf-parse gives us full text; split by page markers if available
  // Fallback: treat entire PDF as single page if numpages <= 1
  if (data.numpages <= 1) {
    return [{ content: data.text, page: 1 }];
  }

  // For multi-page PDFs, we approximate page breaks using form feed chars
  // or split evenly by character count
  const text = data.text;
  const pageBreaks = text.split('\f');

  if (pageBreaks.length > 1) {
    return pageBreaks
      .map((p, i) => ({ content: p.trim(), page: i + 1 }))
      .filter(p => p.content.length > 0);
  }

  // If no form feeds, split by approximate character count per page
  const charsPerPage = Math.ceil(text.length / data.numpages);
  for (let i = 0; i < data.numpages; i++) {
    const start = i * charsPerPage;
    const content = text.slice(start, start + charsPerPage).trim();
    if (content.length > 0) {
      pages.push({ content, page: i + 1 });
    }
  }
  return pages.length > 0 ? pages : [{ content: text, page: 1 }];
}
