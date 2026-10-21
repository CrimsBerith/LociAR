import { requireAdmin } from '../../../../../lib/admin';
import ContentForm from '../ContentForm';
import { getI18n } from '../../../../../lib/i18n-server';
export const dynamic='force-dynamic';
export default async function NewPostPage(){const admin=await requireAdmin({permission:'posts.create'});const{t}=await getI18n();return <section className="page"><div className="pageHeading"><h1>{t('Create post')}</h1><a href="/admin/users">{t('Create or find a user')}</a></div><section className="panel"><ContentForm canPublish={admin.permissions.has('posts.moderate')} canOverride={admin.permissions.has('zones.override')}/></section></section>;}
