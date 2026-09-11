/* CSV -> DOCX converter. The data stays in the browser. */
const state = { rows: [], metadata: {}, footer: {}, schoolInfo: {}, documents: [] };
const fileInput = document.querySelector('#csvFile');
const dropZone = document.querySelector('#dropZone');
const fileStatus = document.querySelector('#fileStatus');
const previewWrap = document.querySelector('#previewWrap');
const recordCount = document.querySelector('#recordCount');
const downloadButton = document.querySelector('#downloadButton');
const message = document.querySelector('#message');
const schoolLookup = document.querySelector('#schoolLookup');
const resultsPanel = document.querySelector('#resultsPanel');

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) readFiles([...fileInput.files]);
});
['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault(); dropZone.classList.add('is-over');
}));
['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault(); dropZone.classList.remove('is-over');
}));
dropZone.addEventListener('drop', (event) => {
  const files = [...event.dataTransfer.files].filter((file) => file.name.toLowerCase().endsWith('.csv'));
  if (files.length) readFiles(files);
});
downloadButton.addEventListener('click', createDocx);

async function readFiles(files) {
  message.textContent = '';
  state.documents = [];
  fileStatus.textContent = `Membaca ${files.length} file CSV...`;
  resultsPanel.hidden = true;
  downloadButton.disabled = true;
  schoolLookup.className = 'school-lookup loading';
  schoolLookup.textContent = 'Membaca file dan menyiapkan pencarian data sekolah...';
  try {
    const documents = await Promise.all(files.map(async (file) => ({ fileName: file.name, ...parseRows(parseCsv(await readFileText(file))) })));
    schoolLookup.textContent = `Mengambil data sekolah untuk ${documents.length} file...`;
    const enriched = await Promise.all(documents.map((document) => lookupSchool(document)));
    if (enriched.some((document) => !document.schoolInfo?.school)) throw new Error('Data sekolah belum ditemukan untuk salah satu file.');
    enriched.forEach((document) => {
      document.selectedPendamping = new Set(document.rows.map((row) => row.pendamping).filter(Boolean));
    });
    state.documents = enriched;
    const first = enriched[0];
    state.rows = first.rows; state.metadata = first.metadata; state.footer = first.footer; state.schoolInfo = first.schoolInfo;
    renderPreview();
    resultsPanel.hidden = false;
    schoolLookup.className = 'school-lookup success';
    schoolLookup.textContent = `${enriched.length} data sekolah ditemukan. Semua file siap diunduh.`;
  } catch (error) { showError(error.message); }
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`File ${file.name} tidak dapat dibaca.`));
    reader.readAsText(file, 'UTF-8');
  });
}

function parseCsv(text) {
  const rows = []; let row = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (char === ';' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value); if (row.some((item) => item.trim())) rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value || row.length) { row.push(value); if (row.some((item) => item.trim())) rows.push(row); }
  return rows;
}

function parseRows(data) {
  const clean = data.map((row) => row.map((value) => String(value ?? '').trim()));
  const npsnRow = clean.find((row) => row[0].replace(/^\uFEFF/, '').toUpperCase() === 'NPSN');
  const schoolRow = clean.find((row) => row[0].toLowerCase().replace(/^\uFEFF/, '').startsWith('nama sekolah'));
  const titleRow = clean.find((row) => row[0].toUpperCase().includes('VERIFIKASI'));
  const metadata = { title: titleRow?.[0] || 'VERIFIKASI KOMITMEN PENDIDIKAN', npsn: cleanValue(npsnRow?.[1] || ''), school: cleanValue(schoolRow?.[1] || '') };
  const headerIndex = clean.findIndex((row) => row[0] === 'NO');
  if (headerIndex < 0) throw new Error('Header "NO" tidak ditemukan. Pastikan pemisah file adalah titik koma (;).');
  const rows = [];
  for (let index = headerIndex + 3; index < clean.length; index += 1) {
    const row = clean[index];
    if (!/^\d+$/.test(row[0])) continue;
    rows.push({ no: row[0], nikPengurus: cleanValue(row[1]), namaPengurus: cleanValue(row[2]), nikSiswa: cleanValue(row[3]), nisn: cleanValue(row[4]), namaSiswa: cleanValue(row[5]), bentuk: cleanValue(row[6]), tingkat: cleanValue(row[7]), july: attendance(row, 8), august: attendance(row, 13), september: attendance(row, 18), ket: cleanValue(row[23]), pendamping: cleanValue(row[24]) });
  }
  if (!rows.length) throw new Error('Tidak ada baris siswa yang ditemukan dalam file CSV.');
  rows.sort(compareStudents);
  const footer = {};
  clean.slice(headerIndex + 3).forEach((row) => { if (row[0].startsWith('"Tanggal') || row[0].startsWith('Tanggal')) footer.date = row[1] || ''; if (row[0].startsWith('"Jabatan') || row[0].startsWith('Jabatan')) footer.position = row[1] || ''; });
  footer.year = extractYear(footer.date);
  return { rows, metadata, footer };
}

function extractYear(dateValue) {
  const match = String(dateValue || '').match(/(?:^|\D)(\d{4})(?:\D|$)/);
  return match ? match[1] : String(new Date().getFullYear());
}

function compareStudents(first, second) {
  const firstClass = classNumber(first.tingkat);
  const secondClass = classNumber(second.tingkat);
  if (firstClass !== secondClass) return firstClass - secondClass;
  return first.namaSiswa.localeCompare(second.namaSiswa, 'id', { sensitivity: 'base' });
}

function classNumber(value) {
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function cleanValue(value) { return String(value || '').replace(/^'+/, '').replace(/^"|"$/g, '').replace(/^\s*:\s*/, '').trim(); }
function attendance(row, start) { return { alpa: cleanValue(row[start]), izin: cleanValue(row[start + 1]), sakit: cleanValue(row[start + 2]), jml: cleanValue(row[start + 3]), percent: cleanValue(row[start + 4]) }; }

function renderPreview() {
  fileStatus.textContent = `${state.documents.length} file CSV · siap diproses`;
  fileStatus.classList.add('ready');
  recordCount.textContent = `${selectedRowCount()} baris dari ${state.documents.length} file siap diproses`;
  downloadButton.disabled = false;
  previewWrap.innerHTML = state.documents.map((document, documentIndex) => {
    const pendamping = [...new Set(document.rows.map((row) => row.pendamping).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'id'));
    const checks = pendamping.map((name) => `<label class="pendamping-option"><input type="checkbox" data-document-index="${documentIndex}" data-pendamping="${escapeHtml(name)}" checked><span>${escapeHtml(name)}</span></label>`).join('');
    return `<div class="file-preview"><div class="file-preview-heading"><strong>${escapeHtml(document.fileName)}</strong><span>${escapeHtml(document.schoolInfo.school)}</span></div><div class="pendamping-filter"><span class="filter-label">Pendamping</span>${checks || '<em>Tidak ada nama pendamping</em>'}</div><button class="file-download-button" type="button" data-document-download="${documentIndex}"><span>↓</span> Unduh ${escapeHtml(document.schoolInfo.school)}</button></div>`;
  }).join('');
}

previewWrap.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[data-document-index]');
  if (!checkbox) return;
  const document = state.documents[Number(checkbox.dataset.documentIndex)];
  if (!document) return;
  if (checkbox.checked) document.selectedPendamping.add(checkbox.dataset.pendamping);
  else document.selectedPendamping.delete(checkbox.dataset.pendamping);
  renderPreviewCounts();
});

previewWrap.addEventListener('click', (event) => {
  const button = event.target.closest('[data-document-download]');
  if (button) createSingleDocx(Number(button.dataset.documentDownload), button);
});

function selectedRowCount() {
  return state.documents.reduce((total, document) => total + document.rows.filter((row) => document.selectedPendamping.has(row.pendamping)).length, 0);
}

function renderPreviewCounts() {
  recordCount.textContent = `${selectedRowCount()} siswa terpilih dari ${state.documents.length} file`;
  downloadButton.disabled = selectedRowCount() === 0;
}

async function lookupSchool(document) {
  const npsn = document.metadata.npsn.replace(/\D/g, '');
  if (!npsn) {
    return { ...document, schoolInfo: {} };
  }
  const url = `https://referensi.data.kemendikdasmen.go.id/pendidikan/npsn/${encodeURIComponent(npsn)}`;
  try {
    const response = await fetchWithTimeout(`https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`, 15000);
    if (!response.ok) throw new Error('Data sekolah tidak dapat diakses.');
    const info = parseSchoolPage(await response.text());
    if (!info.school) throw new Error('Nama sekolah tidak ditemukan pada halaman referensi.');
    return { ...document, schoolInfo: info, metadata: { ...document.metadata, school: info.school } };
  } catch (error) {
    return { ...document, schoolInfo: {}, lookupError: `Data sekolah belum ditemukan untuk NPSN ${npsn}.` };
  }
}

function fetchWithTimeout(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function parseSchoolPage(html) {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
  const read = (label, nextLabels) => {
    const match = text.match(new RegExp(`${label}\\s*:?\\s*(.*?)\\s*(?=${nextLabels.join('|')})`, 'i'));
    return match ? match[1].trim().replace(/\s+/g, ' ') : '';
  };
  const school = read('Nama', ['NPSN']);
  const address = read('Alamat', ['Desa/Kelurahan']);
  const village = read('Desa/Kelurahan', ['Kecamatan/Kota']);
  const district = read('Kecamatan/Kota(?: \\(LN\\))?', ['Kab\\.-Kota/Negara']);
  const city = read('Kab\\.-Kota/Negara(?: \\(LN\\))?', ['Propinsi/Luar Negeri']);
  const province = read('Propinsi/Luar Negeri(?: \\(LN\\))?', ['Status Sekolah']);
  const status = read('Status Sekolah', ['Bentuk Pendidikan']);
  const bentuk = read('Bentuk Pendidikan', ['Jenjang Pendidikan']);
  const level = read('Jenjang Pendidikan', ['Dokumen dan Perijinan']);
  return { school, address, village, district, city, cityLabel: formatRegionLabel(city), province, status, bentuk, level, fullAddress: [address, village, district, city, province].filter(Boolean).join(', ') };
}

function formatRegionLabel(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const match = normalized.match(/^(KAB\.|KABUPATEN|KOTA)\s*(.*)$/i);
  if (!match) return titleCase(normalized);
  const prefix = /^KOTA$/i.test(match[1]) ? 'Kota' : 'Kab.';
  return `${prefix} ${titleCase(match[2])}`.trim();
}

function titleCase(value) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function showError(text) { fileStatus.textContent = 'File belum siap'; fileStatus.classList.remove('ready'); message.textContent = text; resultsPanel.hidden = true; downloadButton.disabled = true; schoolLookup.className = 'school-lookup error'; }

async function createDocx() {
  downloadButton.disabled = true; downloadButton.innerHTML = '<span>…</span> Menyiapkan Word';
  try {
    if (!state.documents.length) throw new Error('Belum ada file CSV yang siap diproses.');
    if (selectedRowCount() === 0) throw new Error('Pilih minimal satu pendamping terlebih dahulu.');
    const archive = new JSZip();
    const filenameCounts = new Map();
    for (const document of state.documents) {
      const selectedRows = document.rows.filter((row) => document.selectedPendamping.has(row.pendamping));
      if (!selectedRows.length) continue;
      state.rows = selectedRows;
      state.metadata = document.metadata;
      state.footer = document.footer;
      state.schoolInfo = document.schoolInfo;
      const blob = await createDocxBlob();
      const baseFilename = outputFileName();
      const count = (filenameCounts.get(baseFilename) || 0) + 1;
      filenameCounts.set(baseFilename, count);
      archive.file(`${baseFilename}${count > 1 ? ` (${count})` : ''}.docx`, blob);
    }
    const zipBlob = await archive.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadBlob(zipBlob, 'FORM-VERKOM-DOCX.zip');
  } catch (error) { showError(`DOCX gagal dibuat: ${error.message}`); }
  downloadButton.disabled = false; downloadButton.innerHTML = '<span>↓</span> Unduh semua .ZIP';
}

async function createSingleDocx(documentIndex, button) {
  const document = state.documents[documentIndex];
  if (!document) return;
  const selectedRows = document.rows.filter((row) => document.selectedPendamping.has(row.pendamping));
  if (!selectedRows.length) { message.textContent = 'Pilih minimal satu pendamping terlebih dahulu.'; return; }
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span>…</span> Menyiapkan DOCX';
  try {
    state.rows = selectedRows;
    state.metadata = document.metadata;
    state.footer = document.footer;
    state.schoolInfo = document.schoolInfo;
    const blob = await createDocxBlob();
    downloadBlob(blob, `${outputFileName()}.docx`);
  } catch (error) { showError(`DOCX gagal dibuat: ${error.message}`); }
  button.disabled = false;
  button.innerHTML = originalLabel;
}

async function createDocxBlob() {
    const response = await fetch('FORM.docx');
    if (!response.ok) throw new Error('Template FORM.docx tidak ditemukan di folder aplikasi.');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const xmlText = await zip.file('word/document.xml').async('text');
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    fillTemplate(xml);
    fillRegionName(xml);
    keepSignatureTogether(xml);
    zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
    const footerFile = zip.file('word/footer1.xml');
    if (footerFile) {
      const footerXml = new DOMParser().parseFromString(await footerFile.async('text'), 'application/xml');
      fillFooter(footerXml);
      zip.file('word/footer1.xml', new XMLSerializer().serializeToString(footerXml));
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fillTemplate(xml) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const tables = [...xml.getElementsByTagNameNS(ns, 'tbl')];
  const infoCells = [...tables[0].getElementsByTagNameNS(ns, 'tc')];
  const info = state.schoolInfo;
  setCellValue(infoCells[0], state.metadata.npsn);
  setCellValue(infoCells[1], info.school || state.metadata.school);
  setCellValue(infoCells[2], info.bentuk || info.level || 'MA');
  setCellValue(infoCells[4], info.fullAddress || info.address || '', '', infoCells[4]);
  const dataTable = tables[1];
  const rows = [...dataTable.getElementsByTagNameNS(ns, 'tr')];
  const sampleRow = rows[2];
  rows.slice(2).forEach((row) => row.parentNode.removeChild(row));
  const monthHeaders = [...dataTable.getElementsByTagNameNS(ns, 'tr')[0].getElementsByTagNameNS(ns, 'tc')];
  setCellText(monthHeaders[7], 'JULI'); setCellText(monthHeaders[8], 'AGUSTUS'); setCellText(monthHeaders[9], 'SEPTEMBER');
  state.rows.forEach((student) => {
    const row = sampleRow.cloneNode(true);
    setRowHorizontalBorder(row, 'single');
    const cells = [...row.getElementsByTagNameNS(ns, 'tc')];
    clearCellText(cells[0]);
    const values = [student.nisn, student.nikSiswa, student.namaSiswa, student.tingkat, student.namaPengurus, student.pendamping, ...monthValues(student.july), ...monthValues(student.august), ...monthValues(student.september)];
    cells.slice(1).forEach((cell, index) => setCellText(cell, values[index] || ''));
    dataTable.appendChild(row);
  });
}

function keepSignatureTogether(xml) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body = xml.getElementsByTagNameNS(ns, 'body')[0];
  const paragraphs = [...body.getElementsByTagNameNS(ns, 'p')];
  const start = paragraphs.findIndex((paragraph) => paragraph.textContent.trim().startsWith('Sampang,'));
  if (start < 0) return;
  const end = paragraphs.findIndex((paragraph, index) => index >= start && /^\.{10,}$/.test(paragraph.textContent.trim()));
  if (end < 0) return;
  paragraphs.slice(start, end + 1).forEach((paragraph, index) => {
    let properties = paragraph.getElementsByTagNameNS(ns, 'pPr')[0];
    if (!properties) {
      properties = paragraph.ownerDocument.createElementNS(ns, 'w:pPr');
      paragraph.insertBefore(properties, paragraph.firstChild);
    }
    if (index < end - start) {
      const keepNext = paragraph.ownerDocument.createElementNS(ns, 'w:keepNext');
      properties.appendChild(keepNext);
    }
    const keepLines = paragraph.ownerDocument.createElementNS(ns, 'w:keepLines');
    properties.appendChild(keepLines);
  });
}

function clearCellText(cell) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  [...cell.getElementsByTagNameNS(ns, 't')].forEach((text) => { text.textContent = ''; });
}

function setCellText(cell, value) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const texts = [...cell.getElementsByTagNameNS(ns, 't')];
  if (!texts.length) return;
  texts[0].textContent = String(value || '');
  texts.slice(1).forEach((text) => { text.textContent = ''; });
}

function setCellValue(cell, value, prefix = '', styleCell = null) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const texts = [...cell.getElementsByTagNameNS(ns, 't')];
  if (!texts.length) {
    const paragraph = cell.getElementsByTagNameNS(ns, 'p')[0];
    if (!paragraph) return;
    const run = paragraph.ownerDocument.createElementNS(ns, 'w:r');
    const text = paragraph.ownerDocument.createElementNS(ns, 'w:t');
    const sourceRun = styleCell && [...styleCell.getElementsByTagNameNS(ns, 'r')].find((item) => item.getElementsByTagNameNS(ns, 'rPr').length);
    const sourceProperties = sourceRun?.getElementsByTagNameNS(ns, 'rPr')[0]
      || styleCell?.getElementsByTagNameNS(ns, 'pPr')[0]?.getElementsByTagNameNS(ns, 'rPr')[0];
    if (sourceProperties) run.appendChild(sourceProperties.cloneNode(true));
    text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    text.textContent = `${prefix}${String(value || '')}`;
    run.appendChild(text);
    paragraph.appendChild(run);
    return;
  }
  const colonIndex = texts.findIndex((text) => text.textContent.includes(':'));
  if (colonIndex < 0) { texts[0].textContent = String(value || ''); return; }
  const colonText = texts[colonIndex].textContent;
  texts[colonIndex].textContent = `${colonText.slice(0, colonText.indexOf(':') + 1)} ${prefix}${String(value || '')}`;
  texts.slice(colonIndex + 1).forEach((text) => { text.textContent = ''; });
}

function setRowHorizontalBorder(row, value) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  [...row.getElementsByTagNameNS(ns, 'tc')].forEach((cell) => {
    const properties = cell.getElementsByTagNameNS(ns, 'tcPr')[0];
    if (!properties) return;
    let borders = properties.getElementsByTagNameNS(ns, 'tcBorders')[0];
    if (!borders) { borders = properties.ownerDocument.createElementNS(ns, 'w:tcBorders'); properties.appendChild(borders); }
    ['top', 'bottom'].forEach((side) => {
      let border = [...borders.getElementsByTagNameNS(ns, side)][0];
      if (!border) { border = properties.ownerDocument.createElementNS(ns, `w:${side}`); borders.appendChild(border); }
      border.setAttributeNS(ns, 'w:val', value);
    });
  });
}

function fillFooter(xml) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const school = state.schoolInfo.school || state.metadata.school || '';
  const npsn = state.metadata.npsn || '';
  [...xml.getElementsByTagNameNS(ns, 't')].forEach((text) => {
    if (/^NPSN:\s*/i.test(text.textContent)) text.textContent = `NPSN: ${npsn}`;
    if (/^PKH\s+/i.test(text.textContent)) text.textContent = `PKH ${state.schoolInfo.cityLabel || state.schoolInfo.city || ''} ${state.footer.year || extractYear(state.footer.date)}`.trim();
  });
  [...xml.getElementsByTagNameNS(ns, 'p')].forEach((paragraph) => {
    const texts = [...paragraph.getElementsByTagNameNS(ns, 't')];
    const joined = texts.map((text) => text.textContent).join('');
    if (!joined.includes('SMPS ISLAM') && !joined.includes('NPSN:')) return;
    const schoolIndex = texts.findIndex((text) => /SMPS ISLAM|MAS |SMA |SD |UPTD/i.test(text.textContent));
    if (schoolIndex >= 0) {
      texts[schoolIndex].textContent = school;
      texts.slice(schoolIndex + 1).forEach((text) => { if (/BADRI|^\s*$/.test(text.textContent)) text.textContent = ''; });
    }
  });
}

function monthValues(item) { return [item.alpa, item.izin, item.sakit, item.percent]; }
function outputFileName() {
  const info = state.schoolInfo;
  return [state.metadata.npsn, info.school || state.metadata.school, info.village, info.district]
    .filter(Boolean)
    .map(cleanFileSegment)
    .join(' - ');
}
function cleanFileSegment(value) {
  return String(value)
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'DATA';
}

function fillRegionName(xml) {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const region = state.schoolInfo.cityLabel || formatRegionLabel(state.schoolInfo.city) || 'Kabupaten Sampang';
  const signatureRegion = region.replace(/^(Kab\.|Kota)\s*/i, '');
  const year = state.footer.year || extractYear(state.footer.date);
  [...xml.getElementsByTagNameNS(ns, 'p')].forEach((paragraph) => {
    const text = paragraph.textContent.trim();
    if (/^Kabupaten\s+Sampang\s*-\s*Tahun/i.test(text)) {
      replaceParagraphText(paragraph, `${region} - Tahun ${year}`, ns);
    } else if (/^Sampang,\s*/i.test(text)) {
      replaceParagraphText(paragraph, `${signatureRegion},  ......  ..................  ${year}`, ns);
    }
  });
}

function replaceParagraphText(paragraph, value, ns) {
  const texts = [...paragraph.getElementsByTagNameNS(ns, 't')];
  if (!texts.length) return;
  texts[0].textContent = value;
  texts.slice(1).forEach((text) => { text.textContent = ''; });
}
