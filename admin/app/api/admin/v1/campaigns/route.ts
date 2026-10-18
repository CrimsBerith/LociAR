import { scalarText } from '../../../../../lib/values';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '../../../../../lib/admin';
import { apiError, enforceRateLimit, requireSameOrigin, unauthorized } from '../../../../../lib/api';
import { campaignAudience, campaignInput, campaignStatus, createCampaign, queueNotification, saveBrand } from '../../../../../lib/campaigns';
import { redeemCode, saveCampaignSteps } from '../../../../../lib/campaign-journeys';
import { idempotencyKey, parseJson, requiredString, uuid, ValidationError } from '../../../../../lib/validation';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  try {
    const body = await parseJson(request);
    const permissions: Record<string, string> = { brand: 'brands.write', create: 'campaigns.write', status: 'campaigns.write', audience: 'campaigns.audience', notify: 'notifications.send', steps: 'campaigns.write', redeem: 'campaigns.write' };
    const action = scalarText(body.action ?? ''), permission = Object.hasOwn(permissions, action) ? permissions[action] : undefined;
    if (!permission) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    const access = await requireAdminApi(permission); if (!access.ok) return unauthorized(access);
    // Audience search and campaign-targeted notifications read people's shared locations.
    if (action === 'audience' || (action === 'notify' && body.campaignId)) {
      const location = await requireAdminApi('users.location.read'); if (!location.ok) return unauthorized(location);
    }
    const limited = await enforceRateLimit(access.context.user.id, 'campaign-operations', 20); if (limited) return limited;
    const reason = requiredString(body.reason, 'reason', 8, 1000), actor = access.context.user.id;
    const result = await executeAction(action, body, request, actor, reason);
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return apiError(error); }
}

async function executeAction(action: string, body: Record<string, unknown>, request: Request, actor: string, reason: string) {
  if (action === 'audience') return await campaignAudience(uuid(body.campaignId, 'campaignId'), actor, reason, body.after ? uuid(body.after, 'cursor') : undefined);
  const key = idempotencyKey(request);
  switch (action) {
    case 'brand': return await saveBrand(body, actor, reason, key);
    case 'create': return await createCampaign(campaignInput(body), actor, reason, key);
    case 'status':
      if (body.status !== 'active' && body.status !== 'paused') throw new ValidationError('Invalid status');
      return await campaignStatus(uuid(body.campaignId, 'campaignId'), body.status, actor, reason, key);
    case 'steps': return await saveCampaignSteps(body, actor, reason, key);
    case 'redeem': return await redeemCode(body, actor, reason, key);
    default: return await queueNotification(body, actor, reason, key);
  }
}
