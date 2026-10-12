import { NextResponse } from 'next/server';
import { requireAdminApi } from '../../../../../lib/admin';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../lib/api';
import { campaignAudience, campaignInput, campaignStatus, createCampaign, queueNotification, saveBrand } from '../../../../../lib/campaigns';
import { redeemCode, saveCampaignSteps } from '../../../../../lib/campaign-journeys';
import { idempotencyKey, parseJson, requiredString, uuid } from '../../../../../lib/validation';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  try {
    const body = await parseJson(request);
    const permissions: Record<string, string> = { brand: 'brands.write', create: 'campaigns.write', status: 'campaigns.write', audience: 'campaigns.audience', notify: 'notifications.send', steps: 'campaigns.write', redeem: 'campaigns.write' };
    const action = String(body.action ?? ''), permission = Object.hasOwn(permissions, action) ? permissions[action] : undefined;
    if (!permission) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    const access = await requireAdminApi(permission); if (!access.ok) return unauthorized(access);
    const limited = await enforceRateLimit(access.context.user.id, 'campaign-operations', 20); if (limited) return limited;
    const reason = requiredString(body.reason, 'reason', 8, 1000), actor = access.context.user.id;
    let result;
    if (action === 'audience') result = await campaignAudience(uuid(body.campaignId, 'campaignId'), actor, reason, body.after ? uuid(body.after, 'cursor') : undefined);
    else {
      const key = idempotencyKey(request);
      if (action === 'brand') result = await saveBrand(body, actor, reason, key);
      else if (action === 'create') result = await createCampaign(campaignInput(body), actor, reason, key);
      else if (action === 'status') {
        if (body.status !== 'active' && body.status !== 'paused') return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        result = await campaignStatus(uuid(body.campaignId, 'campaignId'), body.status, actor, reason, key);
      } else if (action === 'steps') result = await saveCampaignSteps(body, actor, reason, key);
      else if (action === 'redeem') result = await redeemCode(body, actor, reason, key);
      else result = await queueNotification(body, actor, reason, key);
    }
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return apiError(error); }
}
