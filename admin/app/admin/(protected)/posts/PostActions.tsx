'use client';

import { useRef, useState } from 'react';
import { createMutationClient, mutationError } from '../../../../lib/client-mutation';

type Props = {
  postId: string;
  status: string;
  deleted: boolean;
  views: number;
  likes: number;
  comments: number;
};

export default function PostActions(props: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mutation = useRef(createMutationClient());

  async function moderate(action: 'approve' | 'flag' | 'soft_delete' | 'restore') {
    const reason = window.prompt('Reason (minimum 8 characters)');
    if (!reason) return;
    setBusy(true);
    setMessage('');
    try {
      const { response, result } = await mutation.current.post(`/api/admin/v1/posts/${props.postId}/moderate`, { action, reason });
      setMessage(response.ok ? 'Post updated. Refreshing…' : result.error ?? 'Update failed. Please retry.');
      if (response.ok) window.location.reload();
    } catch (error) {
      setMessage(mutationError(error));
    } finally {
      setBusy(false);
    }
  }

  async function setMetrics(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = {
      viewsCount: Number(form.get('views')), likesCount: Number(form.get('likes')),
      commentsCount: Number(form.get('comments')), reason: form.get('reason'),
    };
    try {
      const { response, result } = await mutation.current.post(`/api/admin/v1/posts/${props.postId}/metrics`, payload);
      if (response.status === 409 && result.code === 'approval_required') {
        const approval = await mutation.current.post('/api/admin/v1/approvals', {
          action: 'post_metrics_set', resourceType: 'post', resourceId: props.postId, reason: payload.reason,
          payload: { viewsCount: payload.viewsCount, likesCount: payload.likesCount, commentsCount: payload.commentsCount },
        });
        setMessage(approval.response.ok ? 'Large change sent for independent approval.'
          : approval.result.error ?? 'Approval request failed. Please retry.');
        return;
      }
      setMessage(response.ok ? 'Metrics updated. Refreshing…' : result.error ?? 'Update failed. Please retry.');
      if (response.ok) window.location.reload();
    } catch (error) {
      setMessage(mutationError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="postActions">
      <button type="button" className="secondaryButton" onClick={() => setOpen(value => !value)} aria-expanded={open}>Manage</button>
      {open ? (
        <div className="popoverPanel">
          <div className="buttonRow">
            {props.deleted
              ? <button disabled={busy} onClick={() => moderate('restore')}>Restore</button>
              : <>
                  {props.status !== 'active' ? <button disabled={busy} onClick={() => moderate('approve')}>Approve</button> : null}
                  <button disabled={busy} className="secondaryButton" onClick={() => moderate('flag')}>Flag</button>
                  <button disabled={busy} className="dangerButton" onClick={() => moderate('soft_delete')}>Move to trash</button>
                </>}
          </div>
          <form className="metricForm" onSubmit={setMetrics}>
            <label>Views<input name="views" type="number" min={0} step={1} defaultValue={props.views} required /></label>
            <label>Likes<input name="likes" type="number" min={0} step={1} defaultValue={props.likes} required /></label>
            <label>Comments<input name="comments" type="number" min={0} step={1} defaultValue={props.comments} required /></label>
            <label className="wide">Reason<input name="reason" minLength={8} maxLength={1000} required /></label>
            <button disabled={busy}>Set raw counters</button>
          </form>
          {message ? <p className="formMessage" role="status">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
