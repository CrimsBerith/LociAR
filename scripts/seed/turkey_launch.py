#!/usr/bin/env python3
"""Build the A/B launch drafts, never publish them. All street pins require map review.

Geometry: frozen OpenStreetMap street points, ODbL attribution in launch-street-points.geojson.
Text: original LociAR editorial prompts, not customer reviews or claims of personal visits.
A has 150 Kadikoy + 100 Beyoglu notes and 12 field-only AR drafts. B has 120 notes + 11 AR.
Run with --check in CI; without it to rebuild both JSON files. No network or credentials.
"""
import json
import sys
from pathlib import Path

from world_capitals import distance, MAX_TEXT, MIN_SPACING_M, URL, style_problems

HERE = Path(__file__).resolve().parent
AUTHOR = 'loci.guide'
# A small, deliberately authored writing bank. Names are inserted into the sentence itself;
# one wording may recur in a different neighbourhood, never twice at the same street point.
PROMPTS = '''
Telefonu biraz indir. {yer} için bakılacak tek yön ekran değil.
Bir sonraki köşeyi aceleye getirme; {yer} üzerindeki yürüyüş burada yarışa dönüşmesin.
Plan değişirse sorun değil. {yer} molası da günün bir parçası olabilir.
Bugünkü küçük görev: {yer} boyunca daha önce fark etmediğin bir pencere bul.
Rotanı ezberlemek zorunda değilsin; {yer} adını hatırlaman şimdilik yeter.
Kulaklığın sesini kıs. {yer} çevresinde geçiş yapanları da duyabilmek iyi olur.
Kalabalıkta duracaksan geçişi açık bırak; {yer} herkesin yolu.
Yürürken mesaj yazmak yerine kenara çekil. {yer} sana bir cevap süresi tanır.
Kamera açılmadan da bakılabilir. {yer} bugün fotoğraf istemiyor olabilir.
Bir renk seç ve {yer} üzerindeki yürüyüşte kaç yerde karşına çıktığını say.
Şimdilik hiçbir yere yetişmiyorsan, {yer} üzerinde bunu kendine hatırlat.
Çantanı geçiş yoluna bırakma; {yer} molasında başkasının yolu kapanmasın.
Ayakkabıların bugün ne kadar yol yaptı? {yer} bu hesabın küçük bir satırı olsun.
Fotoğraftan önce arkana bak. {yer} üzerinde kadraja başkası girmek istemeyebilir.
Hızlı geçen bir günü yavaşlatmak için {yer} kadar küçük bir durak da yeter.
Ekranda yakın görünen her köşe hemen yanında olmayabilir; {yer} yönünü tabelayla doğrula.
Yeni bir alışkanlık dene: {yer} yürüyüşünün bir bölümünü bildirimlere bakmadan tamamla.
Günün cümlesini burada bırakabilirsin. {yer} için uzun bir hikâye şart değil.
Tabelalarda gördüğün en kısa kelimeyi seç. {yer} boyunca aklında kalsın.
Bir dostunu bekliyorsan buluşma noktasını açık tarif et; yalnızca {yer} demek yetmeyebilir.
Sokak adını söyleyerek bir cümle kur: {yer}. Cümlenin geri kalanı sende.
Adımların birbirine karışıyorsa biraz kenara geç; {yer} bir nefeslik yer olabilir.
Yolunu kaybetmek şart değil; {yer} üzerinden planlı bir küçük sapma da yapabilirsin.
Kaldırıma bakmayı unutma. {yer} üzerindeki ayrıntılar her zaman göz hizasında değil.
Merak ettiğin bir tabelanın yazı tipini incele. {yer} için küçük bir tasarım oyunu.
İki dakikayı boş sayma; {yer} molasına takvimde ayrıca yer açman gerekmiyor.
Sesli konuşurken etrafı da düşün. {yer} üzerindeki herkes aynı konuşmayı dinlemek istemez.
Yan yana yürürken yolu bütünüyle kapatmayın; {yer} bir kişilik bir sahne değil.
Gözünden kaçan bir ayrıntı bulup kimseye göstermeden sakla. {yer} hatıran biraz da sana kalsın.
Bugünün yürüyüşüne bir isim versen ne olurdu? {yer} bölümünü de ekle.
Bazen en iyi not, tek bir sorudur. {yer} için sen ne sorardın?
Etrafındaki üç dokuyu fark et. {yer} yalnızca renklerden oluşmuyor.
Uzun bir rota yerine kısa bir tur seçebilirsin. {yer} üzerinden dönmek de bir plan.
Sırf fotoğraf çekmek için kapı önünü kapatma; {yer} çevresinde günlük hayat sürüyor.
Kendine bir mola borcun varsa {yer} yürüyüşünün temposunu biraz düşür.
Yanındaki kişi başka bir ayrıntıyı fark etmiş olabilir. {yer} üzerinden geçerken ona sor.
Şehirle arana sürekli bir ekran koyma. {yer} bugün doğrudan bakılabilir bir yer.
Bir önceki köşeyi düşünmeden yeni köşeye var. {yer} için küçük bir dikkat deneyi.
Durup yön bakmak ayıp değil; {yer} tabelasını okumak tahmin etmekten kolay olabilir.
Her sokağın bir hedefi olmak zorunda mı? {yer} bu soruya yürürken cevap versin.
Günün en sakin cümlesini düşün. {yer} için yüksek sesle söylemen gerekmiyor.
Yürüyüşte bir ayrıntıyı saymayı dene: kapı tokmağı, pencere, renk. {yer} seçimi sana bırakıyor.
Bir fotoğrafı paylaşmadan önce kadrajdaki kişileri düşün; {yer} herkese açık bir yer.
Yol arkadaşınla aynı hızda mısın? {yer} biraz da birlikte yürümeyi hatırlatsın.
Sokak köşesini geçince bu not geride kalacak. {yer} fikrini yanında götürebilirsin.
Herkes bir yere yetişiyormuş gibi görünse de sen {yer} boyunca kendi hızında yürü.
Boş bir dakikayı hemen doldurma. {yer} aralığı biraz da boş kalsın.
Not bırakacaksan bir işletmeye puan vermeden de {yer} hakkında konuşabilirsin.
Nereye baktığını değiştir; {yer} üzerindeki aynı yürüyüş başka türlü görünebilir.
Tüm rotayı bitirmek zorunda değilsin. {yer} başlangıç ya da dönüş noktası olabilir.
Geçiş yerlerinde durma. {yer} fotoğrafı için daha güvenli bir noktayı bekle.
Güzel bir ayrıntı bulduysan adrese değil ayrıntıya odaklan; {yer} notun bir ipucu olsun.
Üç kelimelik bir şehir notu dene. {yer} kelime sınırını doldurmak zorunda değil.
Hava nasıl olursa olsun dikkatini dağıtmadan yürü; {yer} çevresindeki geçişleri kontrol et.
Bir kavşağa gelince yalnızca haritaya güvenme. {yer} yönünü çevrenden de oku.
Bu yürüyüşün bir müziği olsaydı hangisi olurdu? {yer} için sesini açmadan da düşünebilirsin.
Farklı bir yazı karakteri bul. {yer} tabelaları arasında kendine sessiz bir oyun kur.
Yarın hatırlamak istediğin tek ayrıntı ne? {yer} üzerindeki seçeneklerden birini seç.
Kısa notlar da bir yerde kalır. {yer} için aklındaki cümleyi uzatman gerekmiyor.
Soluna bak, sağına bak, sonra yoluna bak. {yer} manzarası bütün dikkati almasın.
Bir şey satın almadan da sokağın içinden geçebilirsin. {yer} yürüyüşü başlı başına bir durak.
Yorulduğunu fark edersen rotayı kısalt. {yer} üzerinden eve dönmek de geçerli bir plan.
Beklediğin kişinin seni bulmasını kolaylaştır; {yer} üzerinde belirgin bir sokak tabelası seç.
Kendi şehrinde misafir gibi bakmayı dene. {yer} için bilet ya da büyük bir hazırlık gerekmiyor.
Bugünü bir cümleyle özetlesen {yer} o cümlenin neresinde kalırdı?
Bakmakla kaydetmek aynı şey değil. {yer} hatırası bazen fotoğrafsız da kalır.
Sokaktan geçenlerin yüzlerini değil, {yer} çevresindeki çizgileri kadraja almayı deneyebilirsin.
Konuşmaya kısa bir ara verip dinle. {yer} hakkında ilk fark ettiğin ses ne?
Aynı rotayı farklı saatte düşün. {yer} senin zihninde nasıl değişiyor?
Bir ayrıntıyı kaçırdıysan geri koşman gerekmiyor. {yer} sonraki yürüyüşe de konu olabilir.
Kimseyi acele ettirmeden yürümek de bir nezaket. {yer} bunu denemek için yeterince gerçek bir yer.
Bir gölge, bir çizgi, bir yansıma seç. {yer} notun yalnızca o ayrıntı olsun.
Dikkatini yeni bir yöne çevirmek için rotanı tamamen değiştirmen gerekmiyor. {yer} üzerindesin.
Saatine bakmadan önce etrafına bak. {yer} molasının kaç dakika sürdüğü sonra da öğrenilir.
Haritada bir çizgi olan yer, yürürken bir sürü ayrıntı olur. {yer} bunun bugünkü örneği.
Çocuk arabası ya da tekerlekli sandalye için geçişi açık tut; {yer} yolu hepimize lazım.
Telefonunu şarj etmek kadar kendine ara vermeyi de hatırla. {yer} bu notun bahanesi olsun.
Bir sokak adını ilk kez duyunca sende ne çağrıştırıyor? {yer} için aklına geleni yaz.
Yol tarifi soran biri olursa bilmediğin kısmı uydurma. {yer} tabelası ikinize de yardım edebilir.
Arkana dönüp bir kez daha bakmak bazen yeterli. {yer} üzerinden geçtiğini fark et.
Şimdiki halinle sabahki halin aynı hızda mı yürüyor? {yer} kısa bir karşılaştırma noktası olsun.
Fazladan bir tur atmak yerine bir köşeyi daha dikkatli incele. {yer} için küçük bir değişiklik.
Bir günü bütünüyle anlatmaya çalışma. {yer} notuna yalnızca bugünden bir ayrıntı bırak.
Gördüğün her şeyi hemen yorumlamak zorunda değilsin. {yer} biraz da merak olarak kalsın.
Durduğun yerde yolu kapatıp kapatmadığına bak. {yer} bir mola için başkasının yolundan vazgeçmesin.
Kelime oyunu sevenlere: {yer} adındaki harflerle yeni bir kelime bulabilir misin?
Karşıdan karşıya geçmeden notunu bitir. {yer} ekranı bekleyebilir, trafik beklemeyebilir.
Rota uzadıysa kendine kızma. {yer} üzerinden dönüşü de plana dahil edebilirsin.
Bir dakika boyunca hiçbir şeyi çekmeden bak. {yer} için hafıza deneyi bu kadar.
Yürüdüğün yolu bir arkadaşına üç ipucuyla tarif et. {yer} adını en sona sakla.
Buraya küçük bir soru bırak: {yer} sana hangi kelimeyi hatırlatıyor?
Kalabalığa yetişmek yerine yanındakine yetiş. {yer} yürüyüşünün hızı birlikte belirlenebilir.
Günün telaşını tek bir notta çözmek zorunda değilsin. {yer} için bir cümle yeter.
Bir kapının rengini aklında tut. {yer} sonrasında eve varınca hatırlayıp hatırlamadığını dene.
Sesini değil dikkatini yükselt. {yer} çevresinde keşfedilecek bir ayrıntı ara.
Ufak bir sapma için büyük bir sebep bulman gerekmiyor. {yer} zaten rotanın bir parçası olabilir.
İlk kez gelmiş olsan da her şeyi görmeye çalışma. {yer} için bir sonraki yürüyüşe pay bırak.
Yol üstünde not okumak için güvenli bir kenar seç; {yer} adımlarını telefon yönetmesin.
Bütün sokak aynı fotoğrafa sığmak zorunda değil. {yer} içinden tek bir çizgi seçebilirsin.
Hızını düşürünce gördüğün ilk şey ne oldu? {yer} için kısa bir cevap bırak.
Bugün buradan geçecek birine tek bir soru sorabilsen ne olurdu? {yer} sorusu sende.
İyi bir yol tarifi bir sokak adıyla başlar. {yer} adını doğru yazdığından emin ol.
Biraz yürüyüp aynı soruyu yeniden düşün. {yer} cevap vermek için acele etmiyor.
Kendi gölgeni değil, çevrendeki çizgileri izle. {yer} üzerinde küçük bir kompozisyon kur.
Sokağı yalnızca bir yere varmak için kullanma. {yer} aradaki zamanı da doldurabilir.
Notunu bırakıp telefondan uzaklaşabilirsin. {yer} kalan cümleyi senin yerine yürümeyecek.
Şehrin bir ayrıntısını hatırlamak için adını bilmek şart değil. {yer} için bir tarif bırak.
Yürüyüş arkadaşına sessiz bir ayrıntı göster. {yer} boyunca söze gerek olmayan bir an bul.
Geri dönerken aynı tabela farklı bir açıdan görünecek. {yer} hatırana iki yön de sığsın.
Ufka bakmak güzel; önündeki geçişi kontrol etmek de gerekli. {yer} ikisini sırayla yapmana izin verir.
Bir notu beğenmekten önce tamamını oku. {yer} cümlesinin sonu başından farklı çıkabilir.
Kısa bir turu küçümseme. {yer} üzerinden atılan birkaç adım da bugünün yürüyüşü sayılır.
Başkasının anını kadraja almadan bir şehir fotoğrafı düşün. {yer} bunun için bir deneme olsun.
Yan sokak adını merak ettiysen tabelaya bak. {yer} çevresini öğrenmek küçük sorularla başlar.
Yolun geri kalanını planlamadan önce burada olduğunu fark et. {yer}, şu anki küçük durak.
Bir köşeyi tarif etmek için kaç kelime gerekiyor? {yer} için mümkün olan en kısa tarifi dene.
Gördüğün bir rengi yanındaki kişiye söylemeden seç. {yer} sonunda aynı rengi seçip seçmediğinizi karşılaştırın.
Adım sayısına takılmadan yürümeyi dene. {yer} bugün bir sayıdan fazlası olabilir.
Yazmak istemiyorsan yalnızca oku. {yer} defterinde her ziyaretin imzası olmak zorunda değil.
Kaldırımın boş olması yolu kontrol etmeyi gereksiz kılmaz. {yer} geçişinde dikkat sende olsun.
Bugünden bir ayrıntıyı yarına taşı. {yer} için yazacağın not belki o ayrıntıdır.
'''.strip().splitlines()

AR_LINES = [
    'Ben bu sokağın kaldırım taşıyım. Herkesin adım sayısını biliyorum, kendim bir adım atamıyorum.',
    'Bina konuşuyor: Fotoğraf için biraz geri çekilecektim ama temelden bağlıyım.',
    'Köşe başından bildiriyorum: Gün boyu dönen çok, benim hâlâ başım dönmedi.',
    'Sokak lambasıyım. Mesaiyi hep hava kararınca öğreniyorum; takvim gönderen yok.',
    'Ben şu pencereyim. Manzaraya yıllardır aynı açıdan bakıyorum; filtre değiştirmedim.',
    'Kaldırım taşı: Telefonun adımlarını sayıyor. Ben adımlarını taşıyorum. İş bölümü böyle.',
    'Duvar konuşuyor: Yanımdan geçen herkes bir yere gidiyor. Ben adresin kendisiyim.',
    'Tabelayım. Herkese yol gösteriyorum, kendi yerimi değiştiremiyorum.',
    'Bina notu: Bana yaklaşınca kat çıkmıyorum. Yakından da aynı binayım.',
    'Köşe taşı: Herkes dönüp gidiyor. Ben köşeyi tutmaya devam ediyorum.',
    'Ben bu duvarım. Kulaklarım yok ama yankı konusunda elimden geleni yapıyorum.',
    'Sokak lambası: Gündüz kimse dönüp bakmıyor. Akşam hepimiz aynı fikirdeyiz.',
    'Pencere konuşuyor: Dışarı bakmak için uygulama güncellemesi istemiyorum.',
    'Bir kaldırım taşıyım. Çok gezmiş sayılır mıyım? Herkes üstümden geçti.',
    'Duvar: Bir adım geriye çekilip büyük resme bakacaktım. Arkam da duvarmış.',
    'Tabeladan not: Adres bende, yolculuk sende. En azından birimiz geziyor.',
    'Köşe başıyım. Buluşmalar hep bana yazılıyor; davet listesinde adım yine yok.',
    'Lamba konuşuyor: Bugünün planı belli. Hava kararınca biraz ışık tutacağım.',
    'Pencere: Her gün sokağa bakıyorum. Bir gün sokak da bana baksa diye bekliyorum.',
    'Bina diyor ki: Benim de katıldığım bir yürüyüş olsun isterdim. Kat sayısı yetmiyormuş.',
    'Kaldırım taşı: Ayakkabı modasını takip ediyorum. Başka seçeneğim pek yok.',
    'Duvar notu: Şehir turuna çıkamadım. Tur bugün de önümden geçti.',
    'Sokak tabelası: Yolunu kaybedene yardımcıyım. İnternetim yok ama ismim sabit.',
]

AREAS = [
    ('kadikoy', 'İstanbul', 'A', 150, 6), ('beyoglu', 'İstanbul', 'A', 100, 6),
    ('ankara', 'Ankara', 'B', 26, 1), ('izmir', 'İzmir', 'B', 10, 1),
    ('bursa', 'Bursa', 'B', 9, 1), ('antalya', 'Antalya', 'B', 10, 1),
    ('eskisehir', 'Eskişehir', 'B', 10, 1), ('konya', 'Konya', 'B', 10, 1),
    ('gaziantep', 'Gaziantep', 'B', 5, 1), ('izmit', 'İzmit', 'B', 10, 1),
    ('samsun', 'Samsun', 'B', 10, 1), ('trabzon', 'Trabzon', 'B', 10, 1),
    ('kayseri', 'Kayseri', 'B', 10, 1),
]


def choose_anchors(area, ar_count, points):
    anchors, seen = [], set()
    priorities = {'kadikoy': ['General Asım', 'Moda Caddesi', 'Rıhtım', 'Mühürdar Caddesi', 'Güneşlibahçe', 'Hacı Şükrü'],
                  'beyoglu': ['İstiklal', 'Galip Dede', 'Bankalar', 'Kemankeş', 'Meşrutiyet', 'Necatibey'],
                  'izmit': ['Fethiye']}
    for name in priorities.get(area, []):
        match = next((point for point in points if name in point['place']), None)
        if match is not None and len(anchors) < ar_count:
            anchors.append(match)
            seen.add(match['place'])
    for point in points:
        if point['place'] not in seen and len(anchors) < ar_count:
            anchors.append(point)
            seen.add(point['place'])
    if len(anchors) != ar_count:
        raise ValueError(f'{area}: not enough distinct streets for {ar_count} AR drafts')
    return anchors


def draft_item(area, city, layer, index, point, note_count, note_start, ar_start):
    is_ar = index >= note_count
    text = AR_LINES[ar_start + index - note_count] if is_ar else PROMPTS[(note_start + index) % len(PROMPTS)].format(yer=point['place'])
    item = {'id': f'{area}-{index + 1}', 'kind': 'ar' if is_ar else 'note', 'type': 'talking' if is_ar else 'quest',
            'lang': 'tr', 'text': text, 'lat': point['lat'], 'lng': point['lng'], 'radius_m': 25,
            'notify': not is_ar and index == 0, 'city': city, 'country': 'Türkiye', 'place': point['place'],
            'area_id': area, 'coord': 'approx', 'source': f"https://www.openstreetmap.org/way/{point['way']}",
            'content_origin': 'lociar-editorial-original', 'source_scope': 'street geometry; text is original editorial writing'}
    if is_ar and layer == 'A': item['placement_requirement'] = 'field_cloud_anchor'
    return item


def area_items(area, city, layer, note_count, ar_count, points, note_start, ar_start):
    anchors = choose_anchors(area, ar_count, points)
    notes = [point for point in points if point not in anchors][:note_count]
    if len(notes) != note_count:
        raise ValueError(f'{area}: only {len(notes)} usable note points, need {note_count}')
    return [draft_item(area, city, layer, index, point, note_count, note_start, ar_start)
            for index, point in enumerate(notes + anchors)]


def problems_for(items, existing):
    problems = style_problems(items)
    if len({i['id'] for i in items}) != len(items): problems.append('duplicate ids')
    for index, item in enumerate(items):
        if len(item['text']) > MAX_TEXT or URL.search(item['text']): problems.append(f"{item['id']}: invalid text length or link")
        if not (-90 <= item['lat'] <= 90 and -180 <= item['lng'] <= 180): problems.append(f"{item['id']}: invalid coordinate")
        point = item['lat'], item['lng']
        if any(distance(point, (other['lat'], other['lng'])) < MIN_SPACING_M for other in items[:index] + existing):
            problems.append(f"{item['id']}: too close to another seed")
    return problems


def build():
    geometry = json.loads((HERE / 'launch-street-points.geojson').read_text())
    points = {f['properties']['id']: f['properties']['points'] for f in geometry['features']}
    existing = []
    for name in ['world-capitals', 'landmark-businesses']: existing += json.loads((HERE / f'{name}.json').read_text())['items']
    layers = {'A': [], 'B': []}
    note_index = ar_index = 0
    for area, city, layer, notes, ar in AREAS:
        layers[layer] += area_items(area, city, layer, notes, ar, points[area], note_index, ar_index)
        note_index += notes
        ar_index += ar
    all_items = layers['A'] + layers['B']
    problems = problems_for(all_items, existing)
    if problems: raise ValueError('\n'.join(problems))
    for layer, name in [('A', 'istanbul-beta'), ('B', 'turkey-streets')]:
        data = {'batch': f'{name}-2026-10', 'author_handle': AUTHOR,
                'review_required': 'All coordinates need map review; A AR requires field Cloud Anchors.',
                'geometry_attribution': '© OpenStreetMap contributors, ODbL 1.0', 'items': layers[layer]}
        text = json.dumps(data, ensure_ascii=False, indent=1) + '\n'
        path = HERE / f'{name}.json'
        if '--check' in sys.argv:
            if not path.exists() or path.read_text() != text: raise ValueError(f'{path.name} is out of date')
        else: path.write_text(text)
        print(f"{name}: {sum(i['kind'] == 'note' for i in layers[layer])} notes + {sum(i['kind'] == 'ar' for i in layers[layer])} AR drafts; all held for review")


if __name__ == '__main__':
    try: build()
    except ValueError as error:
        print(error, file=sys.stderr)
        sys.exit(1)
