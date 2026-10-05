export type ContentInput = {
  authorId: string; caption: string; text: string; platform: string; url: string;
  lat: number; lng: number; altitude: number; heading: number; width: number; height: number;
  color: string; background: string; opacity: number; scale: number; rotation: number;
  visibility: 'public' | 'private' | 'friends'; ageRating: 'all' | '13_plus' | '16_plus'; status: 'active' | 'pending_review';
  zoneExceptionReason: string; replacePlacement: boolean;
};
export const emptyContent:ContentInput={authorId:'',caption:'',text:'',platform:'text',url:'',lat:41.0082,lng:28.9784,altitude:0,heading:0,width:0.45,height:0.51,color:'#FFFFFF',background:'#111827',opacity:1,scale:1,rotation:0,visibility:'public',ageRating:'all',status:'pending_review',zoneExceptionReason:'',replacePlacement:false};
