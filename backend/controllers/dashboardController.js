const { query } = require('../config/database');

async function summary(_req, res, next) {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const [countResult, upcomingResult] = await Promise.all([
      query(`select
        (select count(*)::int from public.interviews where starts_at >= $1 and starts_at < $2 and status <> 'cancelled') as today_interviews,
        (select count(*)::int from public.interviews where starts_at >= $3 and starts_at < $4 and status <> 'cancelled') as week_interviews,
        (select count(*)::int from public.managers where is_active = true) as manager_count,
        (select count(*)::int from public.candidates where is_active = true) as candidate_count`,
      [todayStart.toISOString(), tomorrow.toISOString(), weekStart.toISOString(), weekEnd.toISOString()]),
      query(`select i.id, i.starts_at, i.ends_at, i.status,
        json_build_object('name', c.name) as candidate,
        coalesce(json_agg(json_build_object('manager', json_build_object('name', m.name,
          'department', json_build_object('name', d.name))) order by m.name)
          filter (where m.id is not null), '[]'::json) as interview_managers
        from public.interviews i
        join public.candidates c on c.id = i.candidate_id
        left join public.interview_managers im on im.interview_id = i.id
        left join public.managers m on m.id = im.manager_id
        left join public.departments d on d.id = m.department_id
        where i.starts_at >= $1 and i.status <> 'cancelled'
        group by i.id, c.id, c.name order by i.starts_at limit 5`, [now.toISOString()]),
    ]);
    const counts = countResult.rows[0];
    res.json({ todayInterviews: counts.today_interviews, weekInterviews: counts.week_interviews,
      managerCount: counts.manager_count, candidateCount: counts.candidate_count, upcoming: upcomingResult.rows });
  } catch (error) { next(error); }
}

module.exports = { summary };
