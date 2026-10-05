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
export const dynamic='force-dynamic';
export default async function PostDetail({params,searchParams}:{params:Promise<{postId:string}>;searchParams:Promise<SearchParameters>}){
 const admin=await requireAdmin({permission:'posts.read'});const {postId}=await params;
 if(!/^[0-9a-f-]{36}$/.test(postId))notFound();
 const db=adminDb(),snapshot=await db.collection('posts').doc(postId).get();if(!snapshot.exists)notFound();const post=snapshot.data()!;
 const pose=(parseJsonField(post.pose_json)??{}) as Record<string,unknown>;const anchor=(pose.anchor??{}) as Record<string,unknown>;const rect=(anchor.physicalRectMeters??{}) as Record<string,number>;
 const edit=(parseJsonField(post.edit_data_json)??{}) as {layers?:Array<Record<string,unknown>>};const layer=edit.layers?.find(l=>l.type==='text')??{};
 const source=(parseJsonField(post.content_source_json)??{}) as Record<string,unknown>;
 const initial:ContentInput={...emptyContent,authorId:String(post.creator_id),caption:String(post.caption??''),text:String(layer.text??post.caption??''),
 platform:source.url?String(source.platform):'text',url:String(source.url??''),lat:Number(post.lat),lng:Number(post.lng),altitude:Number(pose.altitude??0),heading:Number(pose.heading??0),
 width:Number(rect.width??0.45),height:Number(rect.height??0.51),color:String(layer.color??'#FFFFFF'),opacity:Number(layer.opacity??1),scale:Number(layer.scale??1),rotation:Number(layer.rotation??0),
 visibility:post.visibility,ageRating:['all','13_plus','16_plus'].includes(post.age_rating)?post.age_rating:'all',status:post.status==='active'?'active':'pending_review'};
 const page=await readDocumentPage(db.collection('comments').where('post_id','==',postId),{scope:'post-comments-'+postId,cursors:pageCursors(await searchParams),size:25});
 return <main className="page"><div className="pageHeading"><div><a href="/admin/posts">← Posts</a><h1>{String(post.caption)}</h1><p>@{String(post.creator_handle)} · {postId} · {String(post.status)}</p></div>
 <PostActions postId={postId} status={post.status} deleted={Boolean(post.deleted_at)} views={Number(post.views_count??0)} likes={Number(post.likes_count??0)} comments={Number(post.comments_count??0)}/></div>
 {admin.permissions.has('posts.edit')&&!post.deleted_at?<section className="panel"><h2>Edit content and placement</h2><p className="muted">Saving this editor replaces the text design with the preview shown below. The author stays the same.</p><ContentForm postId={postId} initial={initial} canPublish={admin.permissions.has('posts.moderate')} canOverride={admin.permissions.has('zones.override')}/></section>:null}
 <section className="panel"><h2>Comments</h2>{admin.permissions.has('comments.write')&&post.status==='active'&&!post.deleted_at?<details><summary>Create comment as selected user</summary><CommentForm postId={postId}/></details>:null}
 {page.documents.map(doc=><article className="panel" key={doc.id}><p>@{String(doc.get('username')??doc.get('user_id'))} · {iso(doc.get('created_at'))}</p>
 {admin.permissions.has('comments.write')?<CommentForm postId={postId} commentId={doc.id} initialAuthor={String(doc.get('user_id'))} initialText={String(doc.get('text'))}/>:<p>{String(doc.get('text'))}</p>}</article>)}
 <PageNavigation path={`/admin/posts/${postId}`} next={page.next} previous={page.previous}/></section></main>;
}
