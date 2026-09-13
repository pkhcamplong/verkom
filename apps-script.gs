const SHEET_NAME = 'Log';

function doPost(event) {
  const sheet = getLogSheet_();
  const params = event && event.parameter ? event.parameter : {};
  sheet.appendRow([
    new Date(),
    params.generated_at || '',
    params.school_name || '',
    params.npsn || '',
    params.address || '',
    params.village || '',
    params.district || '',
    params.city || '',
    params.province || ''
  ]);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getLogSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  const headers = ['Server timestamp', 'Client timestamp', 'Nama sekolah', 'NPSN', 'Alamat', 'Desa/Kelurahan', 'Kecamatan', 'Kabupaten/Kota', 'Provinsi'];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}