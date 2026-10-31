export type ContentInput = {
  authorId: string; caption: string; text: string; platform: string; url: string;
  lat: number; lng: number; altitude: number; heading: number; width: number; height: number;
  color: string; background: string; opacity: number; scale: number; rotation: number;
  visibility: 'public' | 'private' | 'friends'; ageRating: 'all' | '13_plus' | '16_plus'; status: 'active' | 'pending_review';
  zoneExceptionReason: string; replacePlacement: boolean;
  /** Frozen when created. Missing on legacy API callers means named; edits preserve existing attribution. */
  authorAttribution?: 'named' | 'anonymous';
  /** Optional Firestore document update-time precondition for reviewed bulk edits. */
  expectedUpdateTime?: string;
  /** Location note: notification radius 15–100 m; approval needs posts.moderate and an active public post. */
  locationNote: boolean; notifyRadius: number; approveNotifications: boolean;
  /** Launch seed batch (`admin/scripts/seed-notes.mjs`); stored as `seed_batch` for measuring and retiring seeds. */
  seedBatch?: string;
};
export const emptyContent:ContentInput={authorId:'',caption:'',text:'',platform:'text',url:'',lat:41.0082,lng:28.9784,altitude:0,heading:0,width:0.45,height:0.51,color:'#FFFFFF',background:'#111827',opacity:1,scale:1,rotation:0,visibility:'public',ageRating:'all',status:'active',zoneExceptionReason:'',replacePlacement:false,locationNote:false,notifyRadius:20,approveNotifications:false};
