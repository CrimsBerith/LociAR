"""Render source-grounded Turkish analysis reports and explanatory diagrams.

These are diagrams, not screenshots. No application/backend data is mutated.
"""
from pathlib import Path
import json, re, math, html, zipfile
from collections import Counter
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=ROOT/'output/pdf'
IMG=OUT/'images'
OUT.mkdir(parents=True,exist_ok=True); IMG.mkdir(parents=True,exist_ok=True)
INV=json.loads((HERE/'source-inventory.json').read_text())
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
pdfmetrics.registerFont(TTFont('LociArial',FONT))
pdfmetrics.registerFont(TTFont('LociArialBold',BOLD))
pdfmetrics.registerFontFamily('LociArial',normal='LociArial',bold='LociArialBold',italic='LociArial',boldItalic='LociArialBold')
W,H=1800,1200
INK='#142B3B'; MUTED='#526B7A'; PAPER='#F8FAFC'; TEAL='#167B68'; BLUE='#25619C'; CORAL='#A74735'; GOLD='#846510'; LINE='#ADBDC7'
TINT={'teal':'#E7F4EE','blue':'#EAF2FA','coral':'#FBEFEA','gold':'#FAF5E5','gray':'#EEF2F5'}
C={'teal':TEAL,'blue':BLUE,'coral':CORAL,'gold':GOLD,'gray':MUTED}

def norm(s):
    return s.replace('\u2011','-').replace('\u2013','-').replace('\u2014','-')

def font(size=34,bold=False): return ImageFont.truetype(BOLD if bold else FONT,size)

def lines(text,limit,f):
    out=[]
    for paragraph in norm(text).split('\n'):
        current=''
        for word in paragraph.split():
            test=(current+' '+word).strip()
            if f.getlength(test)>limit and current:out.append(current);current=word
            else:current=test
        out.append(current)
    return out

def text(d,xy,s,size=34,color=INK,bold=False,width=None):
    f=font(size,bold);x,y=xy
    ls=lines(s,width,f) if width else norm(s).split('\n')
    for l in ls:d.text((x,y),l,font=f,fill=color);y+=int(size*1.33)
    return y

def base(title,subtitle,number):
    im=Image.new('RGB',(W,H),PAPER);d=ImageDraw.Draw(im)
    d.rectangle((0,0,W,12),fill=TEAL)
    text(d,(70,45),'LOCIAR / '+number,25,TEAL,True)
    text(d,(70,95),title,58,INK,True)
    text(d,(72,175),subtitle,30,MUTED,width=1640)
    d.line((70,1125,1730,1125),fill=LINE,width=2)
    text(d,(72,1145),'13 Ekim 2026  |  6052dcd  |  Kaynak koddan açıklama şeması; gerçek ekran görüntüsü değildir.',24,MUTED)
    return im,d

def box(d,rect,title,body='',kind='teal',badge=None,size=31):
    x,y,x2,y2=rect
    d.rounded_rectangle(rect,radius=24,fill=TINT[kind],outline=None)
    d.rounded_rectangle((x,y,x+9,y2),radius=4,fill=C[kind])
    xx=x+28;yy=y+25
    if badge:
        d.ellipse((xx,yy,xx+48,yy+48),fill=C[kind])
        text(d,(xx+14,yy+4),str(badge),29,'#FFFFFF',True)
        xx+=68
    yy2=text(d,(xx,yy),title,35,INK,True,width=x2-xx-24)
    if body:
        end=text(d,(x+28,yy2+20),body,size,INK,width=x2-x-56)
        if end>y2-12: raise ValueError('Diagram text overflow: '+title)

def arrow(d,points,label=None,kind='gray',label_at=None):
    d.line(points,fill=C[kind],width=5,joint='curve')
    a,b=points[-2],points[-1];angle=math.atan2(b[1]-a[1],b[0]-a[0]);r=16
    wings=[b,(b[0]-r*math.cos(angle-.48),b[1]-r*math.sin(angle-.48)),(b[0]-r*math.cos(angle+.48),b[1]-r*math.sin(angle+.48))]
    d.polygon(wings,fill=C[kind])
    if label:
        p=label_at or points[len(points)//2]
        f=font(25);tw=f.getlength(label)
        d.rectangle((p[0]-6,p[1]-5,p[0]+tw+6,p[1]+33),fill=PAPER)
        text(d,p,label,25,C[kind])

def save(im,name):im.save(IMG/name,optimize=True)

def user_diagram():
    im,d=base('Kullanıcı neler yapabiliyor?','İki üretim yolu, beş ana sekme ve hesabın kontrol ettiği izinler','01 / KULLANICI')
    box(d,(70,265,570,510),'Giriş ve başlangıç','Apple / e-posta / anonim\nKoşullar kabulü\nVarsayılan açılış: Harita','gray')
    box(d,(650,265,1730,510),'Yerle ilişkili içerik keşfi','Harita: yakın notlar ve yoğun noktalar\nKeşfet: yayın önizlemesi\nAR: fiziksel konumda yüzeyi yeniden arama','blue')
    arrow(d,[(585,372),(630,372)],kind='blue')
    box(d,(70,555,570,885),'Konum notu','Bulunduğun yerde 220 karakter metin\nFiltre sonrası hemen görünür\nBildirim onayı ayrıca gerekir','teal',badge='A')
    box(d,(650,555,1150,885),'AR paylaşımı','Kamerada yüzeye sabitle\nMetin ve/veya tek GIPHY GIF\nVarsayılan moderasyon bekler','coral',badge='B')
    box(d,(1230,555,1730,885),'Sosyal ve profil','Beğeni / yorum / kaydet\nKişisel koleksiyonlar\nEngelle / bildir / hesabı sil','gold')
    arrow(d,[(900,520),(900,533),(320,533),(320,542)],kind='teal')
    arrow(d,[(900,520),(900,542)],kind='coral')
    arrow(d,[(1480,520),(1480,542)],kind='gold')
    text(d,(75,955),'İzinler kullanıcıda: bildirim • kampanya • admin konumu • teknik veri ayrı tercihlerdir.',32,INK,width=1640)
    text(d,(75,1025),'iOS uygulaması mevcut. Android, özel mesajlaşma ve ödeme sistemi bu sürümde yok.',29,MUTED,width=1640)
    save(im,'01-kullanici-deneyimi.png')

def store_diagram():
    im,d=base('Mağazadaki anonim not nasıl tetiklenir?','GPS alanında 10 saniye teyit; mağaza kapısının fiziksel kanıtı değildir','02 / KONUM')
    for rect,title,body,k,badge in [
        ((70,270,590,510),'A notu bırakır','Ölçülen konumda kısa metin\nFiltre sonrası görünür','teal','1'),
        ((640,270,1160,510),'Bildirim onayı','Varsayılan: 3 uygun beğeni\nveya admin onayı','gold','2'),
        ((1210,270,1730,510),'Erken uyanma','300-400 m bölge\nGPS hazırlığı; bildirim değil','blue','3')]:box(d,rect,title,body,k,badge)
    arrow(d,[(600,385),(628,385)],kind='gold');arrow(d,[(1170,385),(1198,385)],kind='blue')
    box(d,(70,590,860,950),'B notun GPS alanına gelir','Not yarıçapı: 15-100 m\nBelirsizlik: en fazla 35 m\nKabul: mesafe <= yarıçap + min(belirsizlik, 20 m)\n10 s taze ölçüm; >5 s kesinti teyidi başlatır','teal','4',size=32)
    box(d,(970,590,1730,950),'Sunucu seçer, telefon bildirir','En çok beğenilen uygun, görülmemiş not\nKalıcı hesap/not alındı kaydı + aktivite\nNormal not: metinli yerel bildirim\nKilitli yoğun nokta: yalnız not sayısı','blue','5',size=32)
    arrow(d,[(1470,520),(1470,555),(465,555),(465,575)],kind='blue')
    arrow(d,[(875,755),(955,755)],kind='teal')
    text(d,(75,1000),'Kaldırım veya komşu dükkân aynı alanın içinde olabilir. 2-5 m ve 10-15 s teslim garantisi yok.',30,CORAL,width=1640)
    save(im,'02-magaza-notu.png')

def privacy_diagram():
    im,d=base('Anonimlik ve izinler dört farklı veri yoludur','Postun konumu, giriş ölçümü, admin konumu ve alışılmış yer birbirine karıştırılmaz','03 / GİZLİLİK')
    box(d,(70,270,865,575),'Diğer kullanıcıya gösterilen','Metin / yer / sayaçlar\nGerçek yazar ve handle gizli\nDünya haritasında owner yolu gizli','teal',size=34)
    box(d,(935,270,1730,575),'Sunucunun özel operasyon kaydı','creator_id ve sahiplik tutulur\nModerasyon / engel / silme için gerekli\nAdmin delegated içerik farklı olabilir','coral',size=34)
    box(d,(70,635,865,995),'Geçici giriş ve cihaz öğrenimi','GPS fix: giriş kabulü için\nAdmin konum snapshot’ını güncellemez\nAlışılmış yer cihazda kalır\nSürekli sunucuya ev geçmişi yüklenmez','blue',size=33)
    box(d,(935,635,1730,995),'Ayrı admin paylaşım tercihi','Konum: ön plan raporu, 24 saat\nTeknik bağlam: 30 gün\nMFA + özel yetki + gerekçe + audit\nSon rapor; gerçek zamanlı takip değil','gold',size=33)
    text(d,(78,1040),'Anonim post; bütün yorumları, takipleri veya işletmeciye karşı hesabı anonim yapmaz.',30,MUTED,width=1640)
    save(im,'03-gizlilik-ve-izinler.png')

def system_diagram():
    im,d=base('Native iOS - Firebase - Admin mimarisi','Mobil adaptörler, güven kontrollü sunucu işlevleri ve ayrı admin güven sınırı','04 / SİSTEM')
    box(d,(70,270,560,525),'Native iOS','SwiftUI / AppContainer\nRepository protokolleri\nSwiftData taslak + kuyruk','teal')
    box(d,(660,270,1150,525),'Cloud Functions','58 ayrı entrypoint\nNode.js 22 / us-central1\nAuth + üretim App Check','blue')
    box(d,(1250,270,1730,525),'Firestore','Post / profil / özel kayıt\nTransaction / receipt / audit\nKurallı sosyal kenarlar','gray')
    arrow(d,[(570,365),(645,365)],'Callable',label_at=(571,310),kind='blue')
    arrow(d,[(1160,365),(1235,365)],kind='blue')
    box(d,(70,575,560,845),'AR ve konum','Tek ARKit + RealityKit\nARCore: anchor / Geospatial\nCore Location + yerel bildirim','teal')
    box(d,(660,575,1150,845),'Admin App Hosting','Next.js / server components\nSession + TOTP UI + RBAC\nServer-only Admin SDK','coral')
    box(d,(1250,575,1730,845),'Firebase servisleri','Auth / Storage / FCM\nSecret Manager / Vision\nScheduler / PubSub / Crashlytics','gray')
    arrow(d,[(315,540),(315,560)],kind='teal')
    arrow(d,[(1160,660),(1235,660)],kind='coral')
    arrow(d,[(1490,560),(1490,540)],kind='coral')
    box(d,(70,900,1730,1095),'İki yazma sözleşmesi','Post, sayaç, aktivite ve özel veri: yalnız sunucu.\nKendi sosyal kenarları: Rules altında istemci. Admin SDK için ayrıca uygulama izinleri gerekir.','gold',size=30)
    save(im,'04-sistem-mimarisi.png')

def admin_diagram():
    im,d=base('Admin mutasyonu nereden geçiyor?','Tarayıcıya güvenilmez; cookie, yetki, payload ve transaction ayrı katmanlardır','05 / ADMIN')
    specs=[
        ('Tarayıcı formu','Hedef + içerik + gerekçe\nIdempotency anahtarı','gray'),
        ('Oturum / MFA','8 saat __session\nRevoked token ve aktif roller','coral'),
        ('Origin / izin','Same-origin + RBAC\nŞema ve hız kontrolü','coral'),
        ('Servis transaction','Aktör / hedef yeniden kontrol\nTekrar isteği receipt ile bağla','blue'),
        ('Atomik commit','Hedef + işlem kaydı + audit\nGerekirse bağımsız onay','teal'),
        ('Yanıt / işçi','Private / no-store\nAsenkron job gerektiğinde','gray')]
    positions=[(70,270,590,570),(640,270,1160,570),(1210,270,1730,570),(70,650,590,950),(640,650,1160,950),(1210,650,1730,950)]
    for i,((title,body,k),rect) in enumerate(zip(specs,positions),1):box(d,rect,title,body,k,str(i),size=31)
    arrow(d,[(602,405),(628,405)],kind='coral');arrow(d,[(1172,405),(1198,405)],kind='coral')
    arrow(d,[(1470,585),(1470,605),(330,605),(330,635)],kind='blue')
    arrow(d,[(602,785),(628,785)],kind='teal');arrow(d,[(1172,785),(1198,785)],kind='teal')
    text(d,(75,1012),'Somut bulgu: place-notes route’u 429 rate-limit yanıtını döndürmüyor; teknik raporda P2.',29,CORAL,width=1640)
    save(im,'05-admin-islem-zinciri.png')

def ar_diagram():
    im,d=base('AR paylaşımını aynı yüzeyde yeniden bulma','Tek kamera oturumu; bir çözüm başarısız olduğunda sıradaki yol denenir','06 / AR')
    specs=[('Cloud Anchor','Sahipliğe kayıtlı\nTTL ayarı: 365 gün','teal'),('Geospatial','VPS / Earth tracking\nEşik: 5 m / 15°','blue'),('ARKit world map','Özel harita dosyası\nYeniden lokalizasyon','gold'),('Yaklaşık göster','Yön ve bakış rehberi\nKesin kilit sayılmaz','coral')]
    rects=[(70,290,455,620),(495,290,880,620),(920,290,1305,620),(1345,290,1730,620)]
    for i,(rect,(title,body,k)) in enumerate(zip(rects,specs),1):box(d,rect,title,body,k,str(i),size=31)
    for x in [465,890,1315]:arrow(d,[(x,455),(x+20,455)])
    box(d,(70,720,590,990),'Üretim','Orta hedef + algılanmış yüzey\nHost -> register -> post bind\nUzaktan admin yerleşimi yaklaşık','teal',size=30)
    box(d,(640,720,1160,990),'Güvenlik / veri','Keyless token callable\nGoogle sensör bildirimi\nAnonim owner yolu gizli','blue',size=30)
    box(d,(1210,720,1730,990),'Doğrulama sınırı','İki gerçek telefonla yüzey testi\nIşık / doku / açı / restart\nSimülatör fiziksel kilidi kanıtlamaz','coral',size=30)
    text(d,(75,1045),'AR yakınlık kapısı ile konum notunun bildirim yarıçapı ayrı politikalardır.',30,MUTED,width=1640)
    save(im,'06-ar-cozumleme.png')

def data_diagram():
    im,d=base('Hangi veriye kim yazabilir?','Admin SDK Security Rules’u aşar; kendi uygulama izinlerini zorunlu uygular','07 / VERİ')
    box(d,(70,265,590,600),'Kurallı istemci alanı','likes / comments / follows\npost_saves / user_blocks\ncollections / collection_items\nmoderation_flags; sınırlı profil alanları','teal',size=31)
    box(d,(640,265,1160,600),'Sunucu otoritesi','posts / counters / activity\nhandles / profile creation\npreferences / locations / context\npush tokens / receipt / quotas','blue',size=31)
    box(d,(1210,265,1730,600),'Admin operasyonu','Moderasyon / içerik / kampanya\nÖzel veri için ayrı izin\nAudit / işlem receipt / approvals\nMFA + aktör/hesap çiti','coral',size=31)
    arrow(d,[(335,615),(335,655),(900,655),(900,615)],'Sosyal trigger: kaynak satırdan tekrar sayım',kind='teal',label_at=(405,635))
    box(d,(70,705,590,1025),'Cihazda kalan','DraftRecord / SyncQueueRecord\nHesaba bağlı tercihler ve cache\nAlışılmış yer öğrenimi\nBulutun sosyal gerçeği değildir','gray',size=31)
    box(d,(640,705,1160,1025),'Storage / dış servis','World map: claim + owner çiti\nAvatar: slot + Vision moderasyonu\nARCore: sınırlı token + sahiplik\nGIPHY: anahtar yalnız sunucuda','gold',size=31)
    box(d,(1210,705,1730,1025),'Silme ve saklama','32 aktif TTL politikası\nNot alındısı: süresiz, TTL yok\nHesap silme: tekrar eden cascade\nTTL tek başına izin vermez','blue',size=31)
    save(im,'07-veri-ve-guven-sinirlari.png')

def publish_diagram():
    im,d=base('Yayınlanmak ile bildirime girmek farklıdır','AR postu ve konum notu farklı state machine’lerden geçer','08 / YAYIN')
    text(d,(75,270),'AR PAYLAŞIMI',31,CORAL,True)
    box(d,(70,325,540,625),'Yerel taslak / kuyruk','Yüzey + metin/GIF\nKalıcı yayın mutation id','coral',size=33)
    box(d,(665,325,1135,625),'pending_review','Sunucu admission\nVarsayılan moderasyon','gold',size=33)
    box(d,(1260,325,1730,625),'active','Yetkili onay sonrası\nGörünürlük ve engel kontrolleri','teal',size=33)
    arrow(d,[(555,470),(650,470)],kind='coral');arrow(d,[(1150,470),(1245,470)],kind='teal')
    text(d,(75,690),'KONUM NOTU',31,TEAL,True)
    box(d,(70,740,540,1035),'Ölçüm / metin filtresi','220 karakter\nKonum / zone / admission','teal',size=33)
    box(d,(665,740,1135,1035),'active + push:none','Haritada görünür\nBildirim henüz onaylı değil','gold',size=33)
    box(d,(1260,740,1730,1035),'push:approved','3 uygun beğeni veya admin\nGirişte 10 s teyit + server seçimi','blue',size=33)
    arrow(d,[(555,885),(650,885)],kind='teal');arrow(d,[(1150,885),(1245,885)],kind='blue')
    save(im,'08-yayin-durumlari.png')

FUNCTION_PURPOSE={
'ensureProfile':'Profil/özel kayıt ve luid claim kurulumu; Auth kimliğine bağlı.',
'updateHandle':'Benzersiz handle rezervasyonu ve değişim bekleme kuralı.',
'readDataPreferences':'Kendi rıza/tercih revizyonunu okur.',
'setDataPreferences':'Revizyon kontrollü rıza değişimi ve kapatma temizliği.',
'recordUserContext':'İzinli teknik/son konum snapshot’ı; hız ve tazelik kontrolü.',
'onAdminNotificationQueued':'İzinli job’u tekrar doğrular, FCM girişimini claim eder.',
'submitBrandCampaign':'Yetkili marka editöründen yalnız draft kampanya kabulü.',
'readCampaignRegions':'Atanmış canlı tekliflerin yerel izleme bölgelerini verir.',
'recordCampaignArrival':'Geliş/ayrılış ölçümünü kabul eder; tek claim, kota ve aktivite.',
'createPlaceNote':'Ölçülmüş konum, kısa metin ve ortak yayın admission.',
'readPlaceNoteRegions':'Yakın, onaylı, görülmemiş notların wake kümeleri.',
'recordPlaceNoteVisit':'10 s teyit + fix doğrulama; not seçimi ve kalıcı alındı.',
'onPostDensityWritten':'Post değişiminden idempotent yoğunluk/spot güncellemesi.',
'reconcileNoteDensity':'Saatlik yoğunluk ve spot yeniden eşleme.',
'readNoteDensity':'Harita için sınırlı yoğunluk hücresi özeti.',
'expireScheduledNotes':'Admin ends_at süresi dolan içeriği periyodik kaldırır.',
'unlockDenseSpot':'Yerinde geometri kontrolüyle süreli metin erişimi.',
'onReportCreated':'Açık farklı raporlarla eşik aşımında gizleme/iptal.',
'readCampaignZones':'Yakın zone journey adımlarını ve uygunluklarını verir.',
'recordCampaignStep':'Adım sırası/geometri/takvim/kota/kod/progress admission.',
'onCampaignZoneChanged':'Aktif zone değişimlerinde bölge yenileme bildirimi.',
'readActivity':'Alıcıya ait, anonimlik kontrollü aktivite projeksiyonu.',
'readLikeCount':'Yazar/kişi listesi sızdırmadan uygun toplam beğeni.',
'blockPostAuthor':'Post üzerinden gerçek yazarı göstermeden engel ilişkisi.',
'readAnonymousWorldMap':'Sahiplik yolu vermeden izinli sınırlı world-map parçaları.',
'beginWorldMapUpload':'Post/hesaba bağlı draft upload claim/reclamation hazırlığı.',
'createPost':'Sunucu otoriteli AR/text/GIF oluşturma ve anchor bind.',
'deleteOwnPost':'Sahibin post kaldırması ve asset/anchor temizliği.',
'recordPostView':'Post/kullanıcı/UTC gününe göre idempotent görüntüleme.',
'deleteAccount':'Taze kimlik, Apple revoke ve devam ettirilebilir hard delete.',
'retryAccountDeletions':'Beş dakikalık kabul edilmiş hesap silme onarımı.',
'onDeletedAccountObjectFinalized':'Silinen hesaba geç gelen Storage nesnesini temizler.',
'onLikeCreated':'Beğeni sonrası kaynak sayaç, aktivite ve not onayı.',
'onLikeDeleted':'Beğeni kaynağını yeniden sayar; tekrar olay güvenliği.',
'onCommentCreated':'Yorum filtreleme/profil bağlama, sayaç ve aktivite.',
'onCommentDeleted':'Yorum sayaçlarını canlı kaynaktan yeniden sayar.',
'onSaveCreated':'Kaydetme sonrası sunucu sayaçlarını eşler.',
'onSaveDeleted':'Kaydetme kaldırma sonrası yeniden sayım.',
'onFollowCreated':'Takip sayaçları ve uygun aktivite üretimi.',
'onFollowDeleted':'İki profil takip sayaçlarının yeniden sayımı.',
'onPostWritten':'Post değişimiyle profil/sunum sayaçları, onay bildirimi.',
'onProfileUpdated':'Profil değişiminin gerekli yayın/operasyon yansımaları.',
'beginAvatarUpload':'Kotalı ve süreli avatar upload slotu açar.',
'screenAvatar':'Cloud Vision taraması ve kabul edilmiş avatar yayını.',
'cleanupPostMedia':'Sahipsiz/eski varlık ve anchor temizlik kuyruğu.',
'reconcilePostCounters':'Periyodik post/profil sayaç onarımı.',
'retryAvatarDeletions':'Başarısız avatar nesne silmelerini yeniden dener.',
'getArcoreToken':'Aktif hesaba sınırlı keyless ARCore yetkilendirmesi.',
'registerCloudAnchor':'Host edilmiş anchor’ı sahipliğe ve bağlama durumuna kaydeder.',
'registerPushToken':'Hesap/kurulum bazında sunucu push cihaz kaydı.',
'unregisterPushToken':'Kurulum push kaydını kaldırır ve hesap geçişini çitler.',
'onActivityCreated':'Uygun sosyal aktivite için lokalize FCM girişimi.',
'markActivityRead':'Alıcıya bağlı aktivitenin okunma durumunu sunucuda yazar.',
'createInvites':'İzinli davet kodu oluşturma.',
'redeemInvite':'Davet kodunu kullanma ve kullanıcının yayın kapısı durumu.',
'searchGifs':'Server-only anahtarla GIPHY arama ve sonuç doğrulama.',
'readPublicContent':'Mod bazında hesap/blok/anonim/dense kilit projeksiyonu.',
'onWorldMapFinalized':'PubSub Storage finalize üzerinden world-map güvenlik/temizlik.',
}

def inventories():
    p=HERE/'teknik-mimari-analizi.md';s=p.read_text();s=s.split('\n## 23. İşlev envanteri')[0]
    kinds={'onCall':'Callable','onSchedule':'Scheduler','onMessagePublished':'PubSub/Storage','onDocumentCreated':'Firestore create','onDocumentDeleted':'Firestore delete','onDocumentWritten':'Firestore write','onDocumentUpdated':'Firestore update'}
    counts=Counter(kinds.get(x['kind'],x['kind']) for x in INV['functions'])
    s+='\n\n## 23. İşlev envanteri - 58 export\n\n'
    s+='Kaynak index.ts’den otomatik çıkarılmıştır. Tür dağılımı: '+', '.join(f'{k}: {v}' for k,v in counts.items())+'. Callable türü üretimde Auth/App Check kapısını kullanır; diğerleri güvenilir olay/scheduler girişleridir.\n\n'
    s+='| İşlev | Tür | Sorumluluk | Kaynak |\n|---|---|---|---|\n'
    for x in INV['functions']:
        s+=f"| {x['name']} | {kinds.get(x['kind'],x['kind'])} | {FUNCTION_PURPOSE[x['name']]} | {Path(x['module']).name}:{x['line']} |\n"
    s+='\n## 24. HTTP API envanteri - 24 route dosyası\n\nServer component okuma sorguları ayrı route olmak zorunda değildir; aşağıdaki liste HTTP mutasyon/auth uçlarıdır. Dinamik action izinleri ilgili route içinde seçilir.\n\n| Yol | HTTP | Gerekli izin / kapı |\n|---|---|---|\n'
    for r in INV['routes']:
        permission=', '.join(r['permissions'])
        if not permission:
            permission=('action: brands.write; campaigns.write; campaigns.audience; notifications.send' if '/campaigns' in r['path'] else
                'action: posts.moderate veya places.write' if '/place-notes' in r['path'] else
                'kind: users.location.read veya users.telemetry.read' if '/context' in r['path'] else
                'Origin + Auth/session/invite politikası')
        s+=f"| {r['path']} | {', '.join(r['methods'])} | {permission} |\n"
    s+='\n## 25. TTL politika envanteri - 32 koleksiyon\n\nAlan bütününde expires_at kullanılır. TTL fiziksel silme zamanlayıcısıdır; süresi dolmuş kayıt erişimini kod hemen reddetmelidir. Süresiz place_note_notification_receipts bu listede yoktur. cloud_anchor_deletions/account deletion çitleri de bu listeyle aynı yaşam döngüsünde değildir.\n\n| Koleksiyon | TTL alanı |\n|---|---|\n'
    for name in INV['ttl_collections']:s+=f'| {name} | expires_at |\n'
    s+='\n## 26. Bakım ve değişiklik sırası\n\n'
    s+='Önce P2 rate-limit yanıtını gerçek HTTP testiyle kapat; ardından eski dokümanları güncel kaynak modeline göre düzelt. Ayrı iş olarak legacy world-map migration kanıtını tamamla. Kullanıcının ertelediği fiziksel iPhone kabulünde AR çapraz cihaz, gerçek App Attest, APNs, GPS giriş/çıkış, force-quit, ağ kesintisi ve pil ölç. Ölçek optimizasyonunu gerçek query/latency ölçümüyle seç; güvenlik kurallarını veya Auth/App Check’i gevşeterek performans üretme.\n\n'
    s+='Bu rapordaki bulgular kaynak analizi olarak sunulmuştur; bu turda app/backend davranışı değiştirilmedi veya yeniden yayınlanmadı.\n'
    p.write_text(s)

STYLES=getSampleStyleSheet()
STYLES.add(ParagraphStyle(name='LBody',fontName='LociArial',fontSize=10.5,leading=15.3,textColor=colors.HexColor(INK),spaceAfter=9))
STYLES.add(ParagraphStyle(name='LTitle',fontName='LociArialBold',fontSize=27,leading=33,textColor=colors.HexColor(INK),spaceAfter=22))
STYLES.add(ParagraphStyle(name='LH2',fontName='LociArialBold',fontSize=16,leading=21,textColor=colors.HexColor(TEAL),spaceBefore=19,spaceAfter=9,keepWithNext=True))
STYLES.add(ParagraphStyle(name='LH3',fontName='LociArialBold',fontSize=12,leading=17,textColor=colors.HexColor(INK),spaceBefore=12,spaceAfter=6,keepWithNext=True))
STYLES.add(ParagraphStyle(name='LCell',fontName='LociArial',fontSize=8.5,leading=11.5,textColor=colors.HexColor(INK)))
STYLES.add(ParagraphStyle(name='LHead',parent=STYLES['LCell'],fontName='LociArialBold',textColor=colors.white))
STYLES.add(ParagraphStyle(name='LCaption',fontName='LociArial',fontSize=9,leading=13,textColor=colors.HexColor(MUTED),spaceAfter=12))

def markup(s):
    s=norm(s)
    s=re.sub(r'\[([^]]+)\]\([^)]+\)',r'\1',s)
    s=html.escape(s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)
    s=re.sub(r'`([^`]+)`',r'<font name="LociArial">\1</font>',s)
    return s

class ReportDoc(SimpleDocTemplate):
    def afterFlowable(self,flowable):
        if isinstance(flowable,Paragraph) and flowable.style.name in ('LH2','LH3'):
            title=flowable.getPlainText();key='section-'+str(self.seq.nextf('heading'))
            self.canv.bookmarkPage(key);self.canv.addOutlineEntry(title,key,0 if flowable.style.name=='LH2' else 1,False)

def footer(c,doc):
    w,h=doc.pagesize
    c.setStrokeColor(colors.HexColor(LINE));c.setLineWidth(.5);c.line(54,45,w-54,45)
    c.setFont('LociArial',8);c.setFillColor(colors.HexColor(MUTED))
    c.drawString(54,30,'LociAR | 13 Ekim 2026 | Kaynak 6052dcd')
    c.drawRightString(w-54,30,f'{doc.page}')

def table(rows,width):
    n=len(rows[0]);sizes=([width*.24,width*.15,width*.41,width*.20] if n==4 else [width*.35,width*.12,width*.53] if n==3 else [width*.66,width*.34])
    # User capability tables need more room in the middle than an API path table.
    if n==3 and rows[0][0] in ('Alan','Veri/izin','Kanıt','Kontrol','Modül'):
        sizes=[width*.24,width*.39,width*.37]
    if n==3 and rows[0][0]=='Katman':sizes=[width*.16,width*.40,width*.44]
    if n==3 and rows[0][0]=='Yol' and rows[0][1]=='İstemci izni':sizes=[width*.26,width*.38,width*.36]
    if n==3 and rows[0][0]=='Belge / bağ':sizes=[width*.26,width*.42,width*.32]
    if n==3 and rows[0][1]=='HTTP':sizes=[width*.50,width*.10,width*.40]
    if n==3 and rows[0][1]=='Takvim':sizes=[width*.35,width*.25,width*.40]
    if n==2 and rows[0][0]=='Rol':sizes=[width*.30,width*.70]
    if n==2 and rows[0][0]=='Alan':sizes=[width*.22,width*.78]
    cells=[[Paragraph(markup(v),STYLES['LHead' if i==0 else 'LCell']) for v in row] for i,row in enumerate(rows)]
    t=Table(cells,colWidths=sizes,repeatRows=1,hAlign='LEFT',rowSplitRange=(3,len(rows)-2) if len(rows)>8 else None)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor(INK)),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#F0F5F7'),colors.white]),('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor(TEAL))]))
    return t

def render_pdf(source,name):
    path=HERE/source;raw=path.read_text();ls=raw.splitlines();story=[];width=487.28
    i=0
    while i<len(ls):
        l=ls[i].strip()
        if not l:i+=1;continue
        if l.startswith('# '):story.append(Paragraph(markup(l[2:]),STYLES['LTitle']));i+=1;continue
        if l.startswith('## '):story.append(Paragraph(markup(l[3:]),STYLES['LH2']));i+=1;continue
        if l.startswith('### '):story.append(Paragraph(markup(l[4:]),STYLES['LH3']));i+=1;continue
        m=re.match(r'!\[([^]]+)\]\(([^)]+)\)',l)
        if m:
            image=(HERE/m.group(2)).resolve();im=Image.open(image)
            story.append(Spacer(1,8));story.append(RLImage(str(image),width=width,height=width*im.height/im.width))
            story.append(Paragraph(markup(m.group(1))+' - Açıklama şeması; ekran fotoğrafı değildir.',STYLES['LCaption']))
            i+=1;continue
        if l.startswith('|'):
            rows=[]
            while i<len(ls) and ls[i].strip().startswith('|'):
                r=[x.strip() for x in ls[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',x) for x in r):rows.append(r)
                i+=1
            t=table(rows,width)
            if len(rows)<=8:
                previous=story[-1] if story else None
                if isinstance(previous,Paragraph) and previous.style.name in ('LH2','LH3'):
                    story.pop();story.append(KeepTogether([previous,t]))
                else:story.append(KeepTogether([t]))
            else:story.append(t)
            story.append(Spacer(1,11));continue
        paragraph=[l];i+=1
        while i<len(ls) and ls[i].strip() and not ls[i].startswith(('#','|','![')):
            paragraph.append(ls[i].strip());i+=1
        story.append(Paragraph(markup(' '.join(paragraph)),STYLES['LBody']))
    p=OUT/name
    doc=ReportDoc(str(p),pagesize=(595.28,841.89),rightMargin=54,leftMargin=54,topMargin=47,bottomMargin=61,title=ls[0][2:],author='LociAR - source analysis',subject='13 October 2026; source 6052dcd',pageCompression=1)
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return p

def main():
    for f in [user_diagram,store_diagram,privacy_diagram,system_diagram,admin_diagram,ar_diagram,data_diagram,publish_diagram]:f()
    inventories()
    paths=[render_pdf('kullanici-analizi.md','lociar-kullanici-analizi-2026-10-13.pdf'),render_pdf('teknik-mimari-analizi.md','lociar-teknik-mimari-2026-10-13.pdf')]
    with zipfile.ZipFile(OUT/'lociar-semalar-2026-10-13.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(IMG.glob('*.png')):z.write(p,p.name)
    from pypdf import PdfReader
    for p in paths:print(p.name,len(PdfReader(str(p)).pages),'pages',p.stat().st_size,'bytes')
    print('Diagrams:',len(list(IMG.glob('*.png'))))

if __name__=='__main__':main()
