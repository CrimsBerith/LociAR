import { notFound } from 'next/navigation';
import { requireAdmin } from '../../../../../lib/admin';
import { adminDb,iso } from '../../../../../lib/firebase-admin';
import { parseJsonField } from '../../../../../lib/geo';
import { readDocumentPage,pageCursors,type SearchParameters } from '../../../../../lib/pagination';
import type { ContentInput } from '../../../../../lib/content-ops';
import ContentForm from '../ContentForm';
import { emptyContent } from '../../../../../lib/content-models';
import CommentForm from '../CommentForm';
import PostActions from '../PostActions';
import PageNavigation from '../../PageNavigation';
import PostContentPreview from '../PostContentPreview';
import UserContextPanel from '../../UserContextPanel';
import { getI18n } from '../../../../../lib/i18n-server';
export const dynamic='force-dynamic';
export default async function PostDetail({params,searchParams}:{params:Promise<{postId:string}>;searchParams:Promise<SearchParameters>}){
 const admin=await requireAdmin({permission:'posts.read'});const {t}=await getI18n();const {postId}=await params;
 if(!/^[0-9a-f-]{36}$/.test(postId))notFound();
 const db=adminDb(),snapshot=await db.collection('posts').doc(postId).get();if(!snapshot.exists)notFound();const post=snapshot.data()!;
 const pose=(parseJsonField(post.pose_json)??{}) as Record<string,unknown>;const anchor=(pose.anchor??{}) as Record<string,unknown>;const rect=(anchor.physicalRectMeters??{}) as Record<string,number>;
 const edit=(parseJsonField(post.edit_data_json)??{}) as {layers?:Array<Record<string,unknown>>};const layer=edit.layers?.find(l=>l.type==='text')??{};
 const initial:ContentInput={...emptyContent,locationNote:post.note_kind==='location',notifyRadius:Number(post.notify_radius_m??20),approveNotifications:post.push_state==='approved',authorId:String(post.creator_id),caption:String(post.caption??''),text:String(layer.text??post.caption??''),
 platform:'text',url:'',lat:Number(post.lat),lng:Number(post.lng),altitude:Number(pose.altitude??0),heading:Number(pose.heading??0),
 width:Number(rect.width??0.45),height:Number(rect.height??0.51),color:String(layer.color??'#FFFFFF'),opacity:Number(layer.opacity??1),scale:Number(layer.scale??1),rotation:Number(layer.rotation??0),
 visibility:post.visibility,ageRating:['all','13_plus','16_plus'].includes(post.age_rating)?post.age_rating:'all',status:post.status==='active'?'active':'pending_review'};
 const page=await readDocumentPage(db.collection('comments').where('post_id','==',postId),{scope:'post-comments-'+postId,cursors:pageCursors(await searchParams),size:25});
 return <section className="page"><div className="pageHeading"><div><a href="/admin/posts">← {t('Posts')}</a><h1>{String(post.caption)}</h1><p>@{String(post.creator_handle)} · {postId} · {t(String(post.status).replaceAll('_', ' '))}</p></div>
 <PostActions postId={postId} status={post.status} deleted={Boolean(post.deleted_at)} views={Number(post.views_count??0)} likes={Number(post.likes_count??0)} comments={Number(post.comments_count??0)}/></div>
 <section className="panel"><h2>{t('Stored content')}</h2><PostContentPreview post={post}/></section>
 {post.note_kind==='location'?<section className="panel"><h2>{t('Location note')}</h2><p>{t('Measured by {source} · ±{accuracy} m · pin moved {drag} m · notification radius {radius} m · notifications {push}',{source:String(post.location_note?.source??'unknown'),accuracy:String(post.location_note?.accuracy_m??'?'),drag:String(post.location_note?.pin_drag_m??0),radius:String(post.notify_radius_m??20),push:String(post.push_state??'none')})}</p><p className="muted">{t("Anonymous user note at the author's measured position. A physical visit is not verified. Approving it for notifications sends the text to opted-in visitors inside the radius, once per person.")}</p></section>:null}
 {(admin.permissions.has('users.location.read')||admin.permissions.has('users.telemetry.read')||admin.permissions.has('notifications.send'))?<UserContextPanel luid={String(post.creator_id)} canLocation={admin.permissions.has('users.location.read')} canTelemetry={admin.permissions.has('users.telemetry.read')} canNotify={admin.permissions.has('notifications.send')}/>:null}
 {admin.permissions.has('posts.edit')&&!post.deleted_at?<section className="panel"><h2>{t('Edit content and placement')}</h2><p className="muted">{t('Saving this editor replaces the text design with the preview shown below. The author stays the same.')}</p><ContentForm postId={postId} initial={initial} canPublish={admin.permissions.has('posts.moderate')} canOverride={admin.permissions.has('zones.override')}/></section>:null}
 <section className="panel"><h2>{t('Comments')}</h2>{admin.permissions.has('comments.write')&&post.status==='active'&&!post.deleted_at?<details><summary>{t('Create comment as selected user')}</summary><CommentForm postId={postId}/></details>:null}
 {page.documents.map(doc=><article className="panel" key={doc.id}><p>@{String(doc.get('username')??doc.get('user_id'))} · {iso(doc.get('created_at'))}</p>
 {admin.permissions.has('comments.write')?<CommentForm postId={postId} commentId={doc.id} initialAuthor={String(doc.get('user_id'))} initialText={String(doc.get('text'))}/>:<p>{String(doc.get('text'))}</p>}</article>)}
 <PageNavigation path={`/admin/posts/${postId}`} next={page.next} previous={page.previous}/></section></section>;
}
