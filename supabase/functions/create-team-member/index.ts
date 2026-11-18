import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerAuth, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !callerAuth.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized caller' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const [{ data: canManageTeam }, { data: callerProfile }] = await Promise.all([
      userClient.rpc('has_permission', { p_permission_code: 'team.manage' }),
      adminClient.from('profiles').select('company_id').eq('id', callerAuth.user.id).single(),
    ]);

    if (!canManageTeam || !callerProfile) {
      return new Response(JSON.stringify({ error: 'Missing required permission: team.manage' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '').trim();
    if (!email || password.length < 6) {
      return new Response(JSON.stringify({ error: 'Valid email and password (min 6 chars) are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: createdUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !createdUser.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? 'Failed to create Auth user.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = createdUser.user.id;
    const companyId = callerProfile.company_id as string;

    const { data: profile, error: profErr } = await adminClient
      .from('profiles')
      .insert({
        id: userId,
        company_id: companyId,
        employee_code: String(body.employee_code ?? '').trim().toUpperCase(),
        full_name: String(body.full_name ?? '').trim(),
        email,
        job_title: String(body.job_title ?? '').trim(),
        department_id: body.department_id || null,
        primary_business_unit_id: body.primary_business_unit_id || null,
        manager_id: body.manager_id || null,
        employment_type: body.employment_type || 'full_time',
        status: body.status || 'active',
        location: body.location || null,
        timezone: body.timezone || 'UTC',
      })
      .select('*')
      .single();

    if (profErr) {
      await adminClient.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: profErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.initial_role_id) {
      await adminClient.from('user_roles').insert({
        company_id: companyId,
        user_id: userId,
        role_id: body.initial_role_id,
        business_unit_id: body.primary_business_unit_id || null,
        assigned_by: callerAuth.user.id,
      });
    }

    if (Array.isArray(body.product_assignments) && body.product_assignments.length > 0) {
      await adminClient.from('resource_memberships').insert(
        body.product_assignments.map((pa: { product_id: string; access_level: string }) => ({
          company_id: companyId,
          user_id: userId,
          resource_type: 'product',
          resource_id: pa.product_id,
          access_level: pa.access_level || 'contributor',
          granted_by: callerAuth.user.id,
        }))
      );
    }

    return new Response(JSON.stringify({ profile, issuedPassword: password }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
