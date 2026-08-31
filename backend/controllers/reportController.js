const ExcelJS = require('exceljs');
const { query } = require('../config/database');

const headers = ['面試 ID', '開始時間', '結束時間', '狀態', '輪次', '輪次名稱', '錄取結果', '面試者', 'Email', '職位', '部門', '主管', '平均評分', '會議連結', '備註', '建立時間'];

async function reportRows(req) {
  const conditions = ['i.archived_at is null']; const values = [];
  if (req.query.from) { const date = new Date(req.query.from); if (Number.isNaN(date.getTime())) throw new RangeError(); values.push(date.toISOString()); conditions.push(`i.starts_at >= $${values.length}`); }
  if (req.query.to) { const date = new Date(req.query.to); if (Number.isNaN(date.getTime())) throw new RangeError(); values.push(date.toISOString()); conditions.push(`i.starts_at <= $${values.length}`); }
  return (await query(`select i.id, i.starts_at, i.ends_at, i.status, i.round_number, i.round_name, i.hiring_outcome,
    i.meeting_url, i.notes, i.created_at, c.name as candidate_name, c.email as candidate_email, c.position,
    d.name as department_name, coalesce(string_agg(distinct m.name, '、'), '') as manager_names,
    round(avg(f.rating)::numeric, 2) as average_rating
    from public.interviews i join public.candidates c on c.id = i.candidate_id
    join public.departments d on d.id = c.department_id
    left join public.interview_managers im on im.interview_id = i.id
    left join public.managers m on m.id = im.manager_id
    left join public.interview_feedback f on f.interview_id = i.id
    where ${conditions.join(' and ')} group by i.id, c.id, d.id order by i.starts_at desc`, values)).rows;
}

function values(row) {
  return [row.id, row.starts_at, row.ends_at, row.status, row.round_number, row.round_name || '', row.hiring_outcome,
    row.candidate_name, row.candidate_email || '', row.position, row.department_name, row.manager_names,
    row.average_rating == null ? '' : Number(row.average_rating), row.meeting_url || '', row.notes || '', row.created_at];
}

function safeCsv(value) {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function csv(req, res, next) {
  try {
    const rows = await reportRows(req);
    const content = [headers, ...rows.map(values)].map((row) => row.map(safeCsv).join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="interviews.csv"');
    res.send(`\uFEFF${content}`);
  } catch (error) { if (error instanceof RangeError) return res.status(400).json({ message: '匯出日期格式錯誤。' }); next(error); }
}

async function xlsx(req, res, next) {
  try {
    const rows = await reportRows(req);
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'iPEBG Interview System'; workbook.created = new Date();
    const sheet = workbook.addWorksheet('面試報表', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(headers); rows.forEach((row) => sheet.addRow(values(row)));
    sheet.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; });
    sheet.columns.forEach((column, index) => { column.width = [38, 22, 22, 18, 8, 16, 16, 18, 28, 20, 18, 28, 12, 40, 40, 22][index]; });
    [2, 3, 16].forEach((index) => { sheet.getColumn(index).numFmt = 'yyyy-mm-dd hh:mm'; });
    sheet.autoFilter = { from: 'A1', to: 'P1' };
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="interviews.xlsx"');
    res.send(Buffer.from(buffer));
  } catch (error) { if (error instanceof RangeError) return res.status(400).json({ message: '匯出日期格式錯誤。' }); next(error); }
}

module.exports = { csv, xlsx, reportRows };
