import { requireAdmin } from '../../../../../lib/admin';
import ContentForm from '../ContentForm';
export const dynamic='force-dynamic';
export default async function NewPostPage(){const admin=await requireAdmin({permission:'posts.create'});return <main className="page"><div className="pageHeading"><h1>Create post</h1><a href="/admin/users">Create or find a user</a></div><section className="panel"><ContentForm canPublish={admin.permissions.has('posts.moderate')} canOverride={admin.permissions.has('zones.override')}/></section></main>;}
