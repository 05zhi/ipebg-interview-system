function updateClause(changes, allowedColumns) {
  const entries = Object.entries(changes).filter(([column]) => allowedColumns.includes(column));
  return {
    clause: entries.map(([column], index) => `${column} = $${index + 1}`).join(', '),
    values: entries.map(([, value]) => value),
  };
}

module.exports = { updateClause };
