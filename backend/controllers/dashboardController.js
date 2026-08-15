const { supabase } = require('../config/supabase');

async function summary(_req, res, next) {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const count = (table, configure = (query) => query) => configure(supabase.from(table).select('*', { count: 'exact', head: true }));
    const results = await Promise.all([
      count('interviews', (q) => q.gte('starts_at', todayStart.toISOString()).lt('starts_at', tomorrow.toISOString()).neq('status', 'cancelled')),
      count('interviews', (q) => q.gte('starts_at', weekStart.toISOString()).lt('starts_at', weekEnd.toISOString()).neq('status', 'cancelled')),
      count('managers', (q) => q.eq('is_active', true)),
      count('candidates', (q) => q.eq('is_active', true)),
      supabase.from('interviews').select('id, starts_at, ends_at, status, candidate:candidates!candidate_id(name), interview_managers(manager:managers!manager_id(name, department:departments!department_id(name)))')
        .gte('starts_at', now.toISOString()).neq('status', 'cancelled').order('starts_at').limit(5),
    ]);
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    res.json({ todayInterviews: results[0].count, weekInterviews: results[1].count,
      managerCount: results[2].count, candidateCount: results[3].count, upcoming: results[4].data });
  } catch (error) { next(error); }
}

module.exports = { summary };
