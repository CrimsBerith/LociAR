#!/usr/bin/env python3
"""Launch seed for the world layer: one busy place in each of 46 capitals, seven location notes
and one approximate AR post each. Writes scripts/seed/world-capitals.json, which the owner loads
with admin/scripts/seed-notes.mjs (dry run first). See docs/release/LAUNCH_SEED.md.

  python3 scripts/seed/world_capitals.py          # validate + write
  python3 scripts/seed/world_capitals.py --check  # validate + file up to date

Rules (launch content plan, 19 Oct 2026): notes never review a business, every fact carries a
source, no links, no jokes about religion, politics, nations or tragedies, at most 140 characters,
at least 26 m between seeds of one place so each forms its own 25 m group. `coord: approx` marks
an anchor taken from general knowledge: check it on the admin map before applying.

Voice (20 Oct 2026): written like people, not a brochure. Each place mixes a casual or lowercase note,
plain tips, one sourced fact told conversationally and a Turkish note in everyday Turkish. No long
dashes, and no opening phrase repeated across the batch more than MAX_SAME_OPENER times.
"""
import itertools
import json
from collections import Counter
import math
import os
import re
import sys
from dataclasses import dataclass
from typing import List, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'world-capitals.json')
BATCH = 'world-capitals-2026-10'
AUTHOR_HANDLE = 'loci.guide'
MAX_TEXT = 140
MIN_SPACING_M = 26
MAX_SAME_OPENER = 4
NOTE_RADIUS_M = 25
TYPES = {'comic', 'useful', 'hidden', 'history', 'aesthetic', 'quest', 'talking'}
W = 'https://en.wikipedia.org/wiki/'
MAIN = object()  # a note's source: the main source page of its capital

# (type, lang, text, source): source is MAIN, None (no fact to cite) or a URL.
Note = Tuple[str, str, str, object]


@dataclass
class Capital:
    """One busy place: seven location notes and one AR post.

    layout: ('ring', radius_m) or ('line', bearing_deg, step_m, first_k); seven positions either way.
    coord: 'wikipedia' (coordinates from the place's article) or 'approx' (check on the admin map first).
    """
    id: str
    city: str
    country: str
    place: str
    anchor: Tuple[float, float]
    coord: str
    layout: tuple
    source: Optional[str]
    ar: str
    notes: List[Note]
    notify: int  # index of the one note that notifies; the others show on the map only
    ar_at: Optional[Tuple[float, float]] = None


CAPITALS = [
    Capital(id='london', city='London', country='GB', place='Piccadilly Circus', anchor=(51.51, -0.13444), coord='wikipedia',
            layout=('ring', 45), source=W + 'Piccadilly_Circus',
            ar="I'm Anteros. Eros is my brother. I can see how the mix-up happened, but it has been a while.",
            notes=[
                ('comic', 'en', 'The suitcase wheels have picked this exact crossing to give up.', None),
                ('comic', 'en', 'map open, wrong direction, turning the phone instead of myself', None),
                ('useful', 'en', "I suggest another street when I don't want the walk to end. That's usually the reason.", None),
                ('useful', 'en', 'Tube stairs somewhere round here. I keep looking up at the screen instead.', MAIN),
                ('history', 'en', 'One Perrier sign in 1908. It got a bit out of hand after that.', MAIN),
                ('aesthetic', 'en', 'one more change of colour on that screen. then we can go', None),
                ('useful', 'tr', "Karşıya geçerken alışkanlığa güvenme. Londra'da trafik soldan akıyor; iki yöne de bak.", None),
            ], notify=1),
    Capital(id='paris', city='Paris', country='FR', place='Champs-Élysées', anchor=(48.8699, 2.3076), coord='wikipedia',
            layout=('line', 295, 90, -3), source=W + 'Champs-%C3%89lys%C3%A9es',
            ar='Champs-Élysées means Elysian Fields. A big name to fit on a street sign.',
            notes=[
                ('comic', 'en', 'new shoes for a long walk. optimistic choice', None),
                ('comic', 'en', "The Arc fits in the photo. Stranger's elbow came free.", None),
                ('useful', 'en', "It's a wide avenue. I'll wait for the crossing light.", MAIN),
                ('useful', 'en', 'The photo in my head has fewer people in it. The actual avenue has other ideas.', None),
                ('history', 'en', 'The Tour finished here from 1975 to 2023. Hard to picture all those bikes from the pavement.', MAIN),
                ('aesthetic', 'en', 'Waiting for the street lights. From the pavement, before anyone gets ideas about a photo in the road.', None),
                ('useful', 'tr', 'Soruya hemen giriveriyorum bazen. Bir “bonjour” diye başlasam daha iyi.', None),
            ], notify=2),
    Capital(id='madrid', city='Madrid', country='ES', place='Puerta del Sol', anchor=(40.4169, -3.7035), coord='approx',
            layout=('ring', 45), source=W + 'Puerta_del_Sol',
            ar='Kilometre Zero. Finally, a distance I can manage without checking my step count.',
            notes=[
                ('comic', 'en', "The bear is still reaching. I'd have asked someone for a ladder.", None),
                ('comic', 'en', "Twelve grapes with the New Year clock chimes. I'd lose count almost immediately.", MAIN),
                ('useful', 'en', 'Pedestrian square. Still worth keeping an eye out for bikes.', MAIN),
                ('useful', 'en', '“at the bear” is nearly a complete meeting plan. which side though', None),
                ('history', 'en', "The old Kilometre Zero plaque wore out under people's feet. This one replaced it in 2009.", MAIN),
                ('aesthetic', 'en', 'A clock tower can make me forget to check the actual time.', None),
                ('useful', 'tr', 'Akşam yemeğine kadar küçük bir şey yesem mi diye başlayan planı biliyorum. Küçük kalmıyor.', None),
            ], notify=3),
    Capital(id='rome', city='Rome', country='IT', place='Trevi Fountain', anchor=(41.90083, 12.48306), coord='wikipedia',
            layout=('line', 200, 35, 1), source=W + 'Trevi_Fountain',
            ar='The fountain speaking. No wish ready? You can just listen for a bit.',
            notes=[
                ('comic', 'en', "I'd like to hear the fountain without holding a phone between us.", None),
                ('useful', 'en', '“Shall we stay a bit?” is most of what I want to ask here.', MAIN),
                ('useful', 'en', "Fountain looks good in the photo. Still working out where I'm supposed to stand.", MAIN),
                ('history', 'en', "Thirty years to build the fountain. I take a while choosing things too, but that's something else.", MAIN),
                ('comic', 'en', "Coin ready. Still haven't settled on a wish.", MAIN),
                ('aesthetic', 'en', 'ten minutes here with nothing booked after. dangerous amount of freedom', None),
                ('useful', 'tr', 'Dondurmayı külahla yemek istiyorum ama yetişme baskısı var. Kap daha sakin bir seçenek.', None),
            ], notify=1),
    Capital(id='berlin', city='Berlin', country='DE', place='Alexanderplatz', anchor=(52.5217, 13.4136), coord='wikipedia',
            layout=('ring', 50), source=W + 'Alexanderplatz',
            ar='World Clock here. You can blame me for the time. Being late is a separate discussion.',
            notes=[
                ('comic', 'en', 'The TV Tower is useful until I need to remember which side of it I came from.', None),
                ('comic', 'en', '“at the world clock” leaves a surprising amount of room to miss each other', None),
                ('useful', 'en', "U or S? Let me check while we're still above ground.", None),
                ('useful', 'en', 'Sunday me would like Saturday me to buy snacks. Passing that on.', None),
                ('history', 'en', "Alexanderplatz has had this name since 1805. “Alex” is easier when you're sending directions.", MAIN),
                ('quest', 'en', "Looking for a familiar city on the World Clock. Doesn't matter if I already know the time there.", MAIN),
                ('comic', 'tr', 'Döner görünce tanıdık bir şey bulmuş gibi oluyorum. Sonra sos seçme kısmı geliyor.', None),
            ], notify=1),
    Capital(id='amsterdam', city='Amsterdam', country='NL', place='Dam & Kalverstraat', anchor=(52.3726, 4.8921), coord='approx',
            layout=('line', 175, 70, 1), ar_at=(52.37305, 4.892), source=W + 'Dam_Square',
            ar="A dam on the Amstel. That's where the name started. You can probably guess which bit became “dam”.",
            notes=[
                ('history', 'en', 'Kalverstraat had a cattle market. The name makes more sense once you know that.', W + 'Kalverstraat'),
                ('comic', 'en', "The next turn can wait. There's a bike coming.", None),
                ('useful', 'en', "Let the bikes pass before crossing their lane. The bell isn't background noise.", None),
                ('useful', 'en', 'one of those side alleys off kalverstraat. no, not sure which yet', W + 'Kalverstraat'),
                ('history', 'en', "The palace on Dam was the city hall from 1655 until 1808, then it became a royal palace.", MAIN),
                ('aesthetic', 'en', 'Whole buildings above the shops. I forget to give them any attention.', None),
                ('useful', 'tr', 'Bisiklet yolu kaldırımın devamı gibi gelebiliyor. Değil. Geçmeden önce durup bak.', None),
            ], notify=2),
    Capital(id='vienna', city='Vienna', country='AT', place='Kärntner Straße', anchor=(48.206, 16.371), coord='wikipedia',
            layout=('line', 25, 70, -3), source=W + 'K%C3%A4rntner_Stra%C3%9Fe',
            ar='Kärntner Straße is named after Carinthia. I like finding a whole region in a street name.',
            notes=[
                ('comic', 'en', "I'd be the one stopping at a cake window and pretending to read the sign.", MAIN),
                ('useful', 'en', 'Karlsplatz, the Opera, Stephansplatz. If I remember them backwards, remind me.', MAIN),
                ('useful', 'en', 'One coffee and no urgent reason to finish it. Yes please.', None),
                ('history', 'en', 'They widened this street from 9 to 17 metres in the 1800s. Quite a lot of street to have to move.', MAIN),
                ('aesthetic', 'en', 'Trying to catch sight of the cathedral roof between everything else.', None),
                ('quest', 'en', 'just looking at the cakes is apparently a separate activity', None),
                ('useful', 'tr', 'Melange diye sipariş vermeyi aklıma yazdım. Sıram gelince kelimeyi unutabilirim.', None),
            ], notify=0),
    Capital(id='prague', city='Prague', country='CZ', place='Old Town Square', anchor=(50.0870083, 14.4209167), coord='wikipedia',
            layout=('line', 40, 40, 1), source=W + 'Prague_astronomical_clock',
            ar="I'm the clock. Everyone's waiting for me to do something. No pressure, then.",
            notes=[
                ('comic', 'en', "Record the clock, check it's recording, check again. I'd miss the whole show.", None),
                ('comic', 'en', 'cobblestones and suitcase wheels have some things to work out', None),
                ('useful', 'en', 'A few steps back from the clock. All I can see from here is a backpack.', None),
                ('useful', 'en', "Charles Bridge is west. One direction in my head, let's not add too many.", None),
                ('history', 'en', "The clockwork and the astronomical dial go back to 1410, made by Mikuláš of Kadaň and Jan Šindel.", MAIN),
                ('aesthetic', 'en', 'People waiting for the clock make a pretty good show of their own.', None),
                ('useful', 'tr', 'Trdelník mi alsam? Sadece bakarak karar vermeye çalıştığım şeylerden biri daha.', None),
            ], notify=2),
    Capital(id='budapest', city='Budapest', country='HU', place='Váci utca', anchor=(47.4942222, 19.052425), coord='wikipedia',
            layout=('line', 165, 65, -3), source=W + 'V%C3%A1ci_utca',
            ar="Pest on this side, Buda across the river. You can hear both in the city's name.",
            notes=[
                ('comic', 'en', "Can someone say that word slowly once? I'll try, but don't walk away yet.", None),
                ('useful', 'en', "Vörösmarty Square. Sending a pin too, in case the name doesn't help.", MAIN),
                ('useful', 'en', 'one street for walking, another for deciding where to sit', None),
                ('comic', 'en', 'Chimney cake sugar will end up on my coat. I know how I eat things.', None),
                ('hidden', 'en', 'The shop windows keep winning. Looking at the top floors for a change.', None),
                ('aesthetic', 'en', "We could go as far as the river. That's not too specific a plan, is it?", None),
                ('useful', 'tr', 'Macarcada “alma” elma demekmiş. Bunu unutmam herhalde; diğer kelimelere söz veremem.', None),
            ], notify=0),
    Capital(id='lisbon', city='Lisbon', country='PT', place='Rua Augusta', anchor=(38.7084, -9.1368), coord='wikipedia',
            layout=('line', 350, 65, 1), ar_at=(38.7084, -9.1368), source=W + 'Rua_Augusta_Arch',
            ar='An arch completed in 1873. You can look through it without going anywhere. I do that all day.',
            notes=[
                ('comic', 'en', "Flat Rua Augusta first. We'll discuss enthusiasm when we reach a hill.", None),
                ('comic', 'en', "five minutes on the map. i'd like to see the slope before agreeing", None),
                ('useful', 'en', "Next tram is fine. Don't fancy a whole ride pressed against the door.", None),
                ('comic', 'en', 'A pastel de nata is small enough to make buying two feel like one decision.', None),
                ('history', 'en', 'Glory, Valour and Genius on the arch. Which one is which again?', MAIN),
                ('aesthetic', 'en', "Towards the river. I'm leaving the way back as a problem for later.", None),
                ('useful', 'tr', 'Obrigado mu, obrigada mı diye düşünüp teşekkür etmeyi geciktirmek istemiyorum.', None),
            ], notify=1),
    Capital(id='athens', city='Athens', country='GR', place='Monastiraki', anchor=(37.97639, 23.72361), coord='wikipedia',
            layout=('line', 90, 45, 1), source=W + 'Monastiraki',
            ar='Monastiraki means “little monastery”. A small name with a lot around it.',
            notes=[
                ('comic', 'en', "Knowing me, I'll choose the café for the view and sit facing away from it.", None),
                ('useful', 'en', 'Asking the price is enough conversation for a start. Give me a minute on the bargaining.', MAIN),
                ('useful', 'en', 'Next bit of shade, then next stop. Priorities sorted.', None),
                ('comic', 'en', "choosing a fridge magnet shouldn't take longer than choosing a fridge", None),
                ('history', 'en', 'The little Pantanassa church gave this square its name. Easy to miss that connection.', MAIN),
                ('aesthetic', 'en', "Acropolis view and somewhere for my elbows. That's all I'm asking.", None),
                ('comic', 'tr', 'Yunancada “ne” evet, “ohi” hayır. En çok bildiğimi sandığım yerde durup düşünmem gerekecek.', None),
            ], notify=1),
    Capital(id='brussels', city='Brussels', country='BE', place='Grand-Place', anchor=(50.84667, 4.3525), coord='wikipedia',
            layout=('ring', 45), ar_at=(50.8449861, 4.3499932), source=W + 'Grand-Place',
            ar="I'm Manneken Pis. Yes, this is my full size. You can come a bit closer if the crowd leaves room.",
            notes=[
                ('comic', 'en', "Knowing the statue is 55.5 cm tall still doesn't quite prepare you for 55.5 cm.", W + 'Manneken_Pis'),
                ('useful', 'en', "Following somebody with a waffle isn't directions. They might be lost too.", W + 'Manneken_Pis'),
                ('history', 'en', "The flower carpet is a lot of work for something you can't roll up and put away.", MAIN),
                ('aesthetic', 'en', 'Same square after dark? Yes, I want another look.', None),
                ('comic', 'en', '96 metres of town hall tower. my neck prefers the lower details', MAIN),
                ('useful', 'en', "Choose a waffle topping. Immediately notice the one I didn't choose. Every time.", None),
                ('comic', 'tr', "Brüksel waffle'ı mı, Liège waffle'ı mı? Birini seçince öbürü aklımda kalacak.", None),
            ], notify=0),
    Capital(id='copenhagen', city='Copenhagen', country='DK', place='Strøget', anchor=(55.6786, 12.5774), coord='wikipedia',
            layout=('line', 60, 70, -3), source=W + 'Str%C3%B8get',
            ar="I'm the Stork Fountain. Given as a silver wedding gift in 1894. Awkward size to wrap.",
            notes=[
                ('comic', 'en', 'wind in my face whichever way i turn. impressive, really', None),
                ('useful', 'en', 'City Hall Square to Kongens Nytorv along Strøget. We can take a side street if we feel like it.', MAIN),
                ('history', 'en', 'Pedestrianisation started as a trial in 1962. Some trial runs do stick.', MAIN),
                ('useful', 'en', "Quiet bike doesn't mean slow bike. Stopping before I cross.", None),
                ('aesthetic', 'en', 'Window seat, no hurry. I could get used to that.', None),
                ('comic', 'en', 'I need both hands just to carry a coffee without thinking about it.', None),
                ('useful', 'tr', 'Bisiklet zili duyunca önce sesin nereden geldiğini anlamaya çalışıyorum. Keşke daha hızlı anlasam.', None),
            ], notify=3),
    Capital(id='stockholm', city='Stockholm', country='SE', place='Stortorget', anchor=(59.3246389, 18.071425), coord='wikipedia',
            layout=('ring', 32), source=W + 'Nobel_Prize_Museum',
            ar="The Nobel Prize Museum is here. You don't need a clever question ready before going in.",
            notes=[
                ('comic', 'en', "Favourite house colour chosen. Still couldn't tell you the house number.", None),
                ('useful', 'en', "shoes that like cobblestones. that's the packing list", None),
                ('useful', 'en', 'Coffee with something sweet sounds like a plan I could stick to.', None),
                ('history', 'en', "The old Stock Exchange on the north side now houses the Nobel Prize Museum and the Nobel Library.", MAIN),
                ('aesthetic', 'en', "It's still afternoon in my head. The winter sky disagrees.", None),
                ('quest', 'en', 'Who chose these house colours? Did it take long to agree?', None),
                ('comic', 'tr', 'Kahve molasına bir isim verilmesini seviyorum. “Fika yapıyorum” demek daha kararlı geliyor.', None),
            ], notify=2),
    Capital(id='warsaw', city='Warsaw', country='PL', place='Old Town Market Place', anchor=(52.2497, 21.0122), coord='approx',
            layout=('ring', 32), source=W + 'Warsaw_Mermaid',
            ar="I'm the mermaid. Sword, shield, no pockets. Carrying things is a problem you don't think about at first.",
            notes=[
                ('comic', 'en', "A mermaid on a square. Explaining her to a child would take more history than I've got ready.", None),
                ('useful', 'en', 'Royal Castle square next. A route with fewer turns suits me.', None),
                ('history', 'en', "Looks centuries old, right? Most of this square was carefully rebuilt after the Second World War.", None),
                ('aesthetic', 'en', 'Turn round, different colours. Squares do have an advantage over streets.', None),
                ('useful', 'en', 'Mixed pierogi, please. Saves one decision until I start picking favourites.', None),
                ('comic', 'en', "pigeons never seem unsure whether they're allowed to be here", None),
                ('quest', 'tr', '“Dziękuję” demeden önce sessizce denemem gerekiyor. Tam söyleyecekken harflerin sırası değişiyor.', None),
            ], notify=1),
    Capital(id='dublin', city='Dublin', country='IE', place='Grafton Street', anchor=(53.34139, -6.26028), coord='wikipedia',
            layout=('line', 165, 70, -3), source=W + 'Grafton_Street',
            ar="I'm a street with live music. You can stay for a song without deciding what to do after it.",
            notes=[
                ('comic', 'en', 'Jacket on, jacket off. Need somewhere to put it if this is going to be the whole walk.', None),
                ('useful', 'en', 'The north end by College Green still has traffic. A pedestrian street can change before you notice.', MAIN),
                ('history', 'en', "Molly Malone used to stand at the top of this street. In 2014 she moved round the corner to Suffolk Street.", MAIN),
                ('useful', 'en', "if i stop for the whole song, i'd like to have some change ready", None),
                ('aesthetic', 'en', "St Stephen's Green next, if we've had enough noise.", None),
                ('comic', 'en', "About 500 metres of street. No idea how long I'd take to walk it with music on the way.", MAIN),
                ('useful', 'tr', 'Bir sokak müzisyeninin şarkısını yarıda bırakıp gitmek zor geliyor. Planımda bu süre yoktu.', None),
            ], notify=0),
    Capital(id='belgrade', city='Belgrade', country='RS', place='Knez Mihailova', anchor=(44.8178, 20.4569), coord='approx',
            layout=('line', 315, 75, -3), source=W + 'Knez_Mihailova_Street',
            ar="Pedestrian since 1987. You can slow down a bit. I'm not going anywhere.",
            notes=[
                ('comic', 'en', 'Terazije to Kalemegdan, with several stops for no particular reason.', MAIN),
                ('useful', 'en', 'Sava meets Danube. I want more time for that than a quick photo.', None),
                ('history', 'en', "The street has carried Prince Mihailo Obrenović's name since 1870.", MAIN),
                ('aesthetic', 'en', "Funny how many building colours I notice when I'm not late for something.", None),
                ('useful', 'en', 'This coffee first. The next coffee is getting ahead of things.', None),
                ('comic', 'en', 'ordering for “a small appetite” is hard when everything sounds good', None),
                ('useful', 'tr', 'Čarapa, çorap. Kašika, kaşık. Tanıdık bir kelime duyunca konuşmanın kalanını da anlayacakmışım gibi geliyor.', None),
            ], notify=1),
    Capital(id='sarajevo', city='Sarajevo', country='BA', place='Baščaršija', anchor=(43.85975, 18.43115), coord='approx',
            layout=('ring', 35), source=W + 'Ba%C5%A1%C4%8Dar%C5%A1ija',
            ar="I'm the fountain. If you're meeting someone here, say which side. It saves a little circling.",
            notes=[
                ('comic', 'en', "The pigeons seem quite sure where they belong. I'd like some of that certainty.", None),
                ('useful', 'en', 'Can you show me how to pour the coffee? Once slowly should do it. Maybe twice.', None),
                ('history', 'en', "Baščaršija goes back to 1462. The name is Turkish: baş (main) and çarşı (market).", MAIN),
                ('aesthetic', 'en', "I'd follow the sound of hammering. Street names can come second for a minute.", None),
                ('useful', 'en', 'How small is the small portion? An important question before I nod confidently.', None),
                ('quest', 'en', "Hvala. A short word I'd like to remember at the right moment.", None),
                ('useful', 'tr', 'Başçarşı adını duyunca çevirmeye çalışmıyorum. Bazen bir kelimenin tanıdık gelmesi yetiyor.', MAIN),
            ], notify=1),
    Capital(id='baku', city='Baku', country='AZ', place='Fountains Square', anchor=(40.37083, 49.83694), coord='wikipedia',
            layout=('ring', 50), source=W + 'Fountains_Square,_Baku',
            ar='This square used to be called Parapet. The fountains got the name in the end.',
            notes=[
                ('comic', 'en', 'hair carefully arranged for the wind to make its own decision', None),
                ('useful', 'en', "Nizami Street for now. We'll see which turn looks interesting.", MAIN),
                ('history', 'en', "Renovated in 2010. Now I'm curious what the square looked like before.", MAIN),
                ('aesthetic', 'en', 'The fountains with the lights on too, please. Not finished looking yet.', None),
                ('comic', 'en', "If we meet at a fountain here, we'll need to be more specific.", MAIN),
                ('useful', 'tr', '“Çox sağ ol” derken kelimeler yabancı gelmiyor. Yine de söyleyişi dinlemek isterim.', None),
                ('useful', 'tr', 'Armudu bardağı tutarken elim kendiliğinden aynı yere gidiyor.', None),
            ], notify=1),
    Capital(id='tbilisi', city='Tbilisi', country='GE', place='Rustaveli Avenue', anchor=(41.701306, 44.796167), coord='wikipedia',
            layout=('line', 140, 60, -3), source=W + 'Rustaveli_Avenue',
            ar='Rustaveli Avenue is named after Shota Rustaveli. A poet with a lot of addresses on his street.',
            notes=[
                ('comic', 'en', "How do I say I'm full without sounding rude? Fairly high on my list of useful phrases.", None),
                ('useful', 'en', "Metro near both ends of the avenue. Good to know I haven't promised to walk the whole thing.", MAIN),
                ('history', 'en', "It has carried the poet Shota Rustaveli's name since 1918.", MAIN),
                ('aesthetic', 'en', 'The opera house front. Looked at one pattern and now I can see three more.', None),
                ('useful', 'en', 'choosing something to share is easy until it arrives', None),
                ('quest', 'en', "Gmadlobt. I'd like to say thank you without having to check my phone first.", None),
                ('comic', 'tr', 'Haçapuri söylemesi de yemesi de ayrı mesele. Birini öğrenip öbürüne geçerim.', None),
            ], notify=0),
    Capital(id='tashkent', city='Tashkent', country='UZ', place='Amir Timur Square', anchor=(41.3111, 69.2796), coord='approx',
            layout=('ring', 60), source=W + 'Amir_Timur_Square',
            ar='Amir Timur Square, since 1994. A place name can be short and still need a whole history to explain it.',
            notes=[
                ('useful', 'en', "Metro ceiling's worth a look. Let me stand out of the way first.", None),
                ('comic', 'en', 'plov sounds like the sort of lunch that changes the afternoon plan', None),
                ('useful', 'en', "Water packed? That's the question before we've left, ideally.", None),
                ('aesthetic', 'en', "An evening bench. Doesn't have to be the best bench, just one we can sit on.", None),
                ('quest', 'en', "Rahmat. Putting that in the short list of words I can remember when someone's waiting.", None),
                ('comic', 'en', 'A slice of melon is easier to choose than a whole one. Starting small.', None),
                ('useful', 'tr', '“Rahmat” teşekkür, “non” ekmek. İki kelimeyle bir öğle yemeğine başlayabilirim.', None),
            ], notify=0),
    Capital(id='skopje', city='Skopje', country='MK', place='Old Bazaar', anchor=(41.99837, 21.43472), coord='approx',
            layout=('ring', 40), ar_at=(41.99753, 21.4332), source=W + 'Old_Bazaar,_Skopje',
            ar='People traded here in the 12th century. I wonder what counted as a good place to meet back then.',
            notes=[
                ('useful', 'en', "The Stone Bridge connects the Old Bazaar with Macedonia Square over the Vardar. 12 arches, 15th century.", MAIN),
                ('useful', 'en', "burek for breakfast sounds like a decision i wouldn't need to sleep on", None),
                ('useful', 'en', "Saving where I came into the bazaar. My memory isn't getting this job on its own.", None),
                ('aesthetic', 'en', "An old courtyard. That's enough to make me forget which turn I meant to take.", MAIN),
                ('quest', 'en', "Watching someone's hands work is strangely absorbing. Almost forget to see what they're making.", None),
                ('comic', 'en', 'One bridge photo where I remember to look at the river with my actual eyes too.', MAIN),
                ('useful', 'tr', 'Çarşıda Türkçe bir kelime duyarsam dönüp bakarım. Kendi adımı duymuşum gibi oluyor.', None),
            ], notify=2),
    Capital(id='cairo', city='Cairo', country='EG', place='Khan el-Khalili', anchor=(30.0475, 31.26222), coord='wikipedia',
            layout=('line', 270, 40, 0), source=W + 'Khan_el-Khalili',
            ar='Khan el-Khalili. I had a route in mind. It lasted until the second turn.',
            notes=[
                ('comic', 'en', 'Heard the price. Need a moment between that and knowing what to say back.', None),
                ('useful', 'en', "Gold in a window. Looking isn't the same as planning to buy, just to be clear.", MAIN),
                ('useful', 'en', "one landmark i can find again. let's start with that", None),
                ('history', 'en', "The district is named after Jaharkas al-Khalili, Master of the Stables to Sultan Barquq.", MAIN),
                ('aesthetic', 'en', 'Lanterns lit. I can look at a few without making a separate photo of every one.', None),
                ('useful', 'en', '“Somewhere in these lanes” is a lot of somewhere. Can you point out the coffeehouse?', MAIN),
                ('useful', 'tr', 'Pazarlıkta hemen cevap vermem gerekmese rahatlayacağım. Önce biraz düşüneyim.', None),
            ], notify=0),
    Capital(id='doha', city='Doha', country='QA', place='Souq Waqif', anchor=(25.28738, 51.53321), coord='wikipedia',
            layout=('ring', 40), source=W + 'Souq_Waqif',
            ar='Souq Waqif means “the standing market”. Sitting down for a bit still seems reasonable.',
            notes=[
                ('comic', 'en', "Falcon market. I have questions, but I don't even know which one to start with.", MAIN),
                ('useful', 'en', "Evening for this walk. No argument from me about waiting until it's cooler.", None),
                ('history', 'en', "The souq was restored between 2006 and 2008 and kept its old market feel.", MAIN),
                ('aesthetic', 'en', 'Lights on, slow walk through the lanes. Dinner can take a little longer to decide.', None),
                ('useful', 'en', "Covered shoulders and knees for the souq walk. That's easy enough to plan.", None),
                ('comic', 'en', "spices are difficult to photograph. the part i want doesn't come through", None),
                ('useful', 'tr', 'Çarşı planını akşama bırakırım. Sıcakta planım genellikle gölgeye kadar sürüyor.', None),
            ], notify=0),
    Capital(id='amman', city='Amman', country='JO', place='Rainbow Street', anchor=(31.950618, 35.923107), coord='wikipedia',
            layout=('line', 75, 55, -3), source=W + 'Rainbow_Street',
            ar='Rainbow Street was named after a cinema. I like that the name stayed.',
            notes=[
                ('comic', 'en', 'A hill changes what I mean by “just around the corner”.', None),
                ('useful', 'en', "Souk Jara: first check if it's on, then tell everyone that's the plan.", MAIN),
                ('useful', 'en', "rooftop, a view, a seat. no need to keep comparing once we've found those", MAIN),
                ('aesthetic', 'en', "Lights on the hills. I'm staying a moment, if that's all right.", None),
                ('quest', 'en', "Rainbow Street is a good name. I'd have overthought it and called it something boring.", None),
                ('history', 'en', "First Circle at one end. I'm better at remembering routes when there's a clear beginning.", MAIN),
                ('useful', 'tr', '“Şukran” aklımda. Teşekkür edeceğim anda aklımda kalması gereken başka kelimeler de var.', None),
            ], notify=0),
    Capital(id='tunis', city='Tunis', country='TN', place='Avenue Habib Bourguiba', anchor=(36.800054, 10.185184), coord='wikipedia',
            layout=('line', 90, 80, -3), source=W + 'Avenue_Habib_Bourguiba',
            ar='Avenue Habib Bourguiba. You can start with a walk. The rest of the plan can wait.',
            notes=[
                ('useful', 'en', "Middle promenade first. We can choose a side when we've looked at both.", None),
                ('comic', 'en', 'Mint tea with pine nuts. How do I get the last nuts out without making a small performance?', None),
                ('useful', 'en', 'Medina at the west end. Let me work out west before we confidently set off.', None),
                ('aesthetic', 'en', "I take fewer photos when I like the light. Then wish I'd taken one more.", None),
                ('history', 'en', 'Ibn Khaldun has been here since 1978. He gets a different view of the avenue from there.', MAIN),
                ('quest', 'en', 'shukran or merci. nice to have a choice when i forget one', None),
                ('useful', 'tr', 'Çaydaki çam fıstıklarını en sona saklamak geliyor içimden. Önce nasıl alacağımı çözmem lazım.', None),
            ], notify=1),
    Capital(id='nairobi', city='Nairobi', country='KE', place='Kenyatta Avenue', anchor=(-1.2844, 36.8217), coord='approx',
            layout=('line', 100, 70, -3), source=None,
            ar="Nairobi, with a national park at the city's edge. A lot to fit into the answer to 'where shall we go?'",
            notes=[
                ('useful', 'en', 'Which matatu? The colours are great, but I still need someone to tell me the route.', None),
                ('comic', 'en', "Pole pole. Slowly. A phrase I could use more often, even when I'm in a hurry.", None),
                ('useful', 'en', 'Phone in my pocket. Trying to notice the street for a change.', None),
                ('aesthetic', 'en', "Jacarandas in flower are on my list. Can't ask them to fit my dates, though.", None),
                ('quest', 'en', "asante. a word i'd like to remember without reaching for my phone", None),
                ('comic', 'en', 'Sharing lunch saves me a little of the choosing. More time to actually eat and talk.', None),
                ('useful', 'tr', '“Asante” teşekkürler demek. Kısa bir kelime; tam gerektiği anda hatırlamak istiyorum.', None),
            ], notify=1),
    Capital(id='accra', city='Accra', country='GH', place='Oxford Street, Osu', anchor=(5.559, -0.1822), coord='approx',
            layout=('line', 0, 70, -3), source=None,
            ar="Oxford Street, Accra. If you're sending someone your location, include the city.",
            notes=[
                ('comic', 'en', 'Jollof first. Opinion on jollof after actually trying it.', None),
                ('useful', 'en', "Water in the bag. Longer walk later, if it's cooler.", None),
                ('quest', 'en', "Medaase. Thank you in Twi. Rehearsing now so I don't go blank at the counter.", None),
                ('aesthetic', 'en', "What's the story behind that kente pattern? I'd rather ask than guess.", None),
                ('useful', 'en', 'Which way does this tro-tro go? Nodding like I understand will only take me further in the wrong direction.', None),
                ('comic', 'en', "plantain chips. the bag always looks bigger before it's open", None),
                ('comic', 'tr', 'Akwaaba, hoş geldin. Bir kelimeyi duyunca onun söylendiği sesi de hatırlamak istiyorum.', None),
            ], notify=1),
    Capital(id='tokyo', city='Tokyo', country='JP', place='Shibuya Crossing', anchor=(35.6595, 139.70056), coord='wikipedia',
            layout=('ring', 45), ar_at=(35.659, 139.7006), source=W + 'Shibuya_Crossing',
            ar="I'm Hachikō. Waiting here is my thing. You don't need to keep me company past the green light.",
            notes=[
                ('useful', 'en', 'I plan conversations on the way to meeting people. Then open with “hey” anyway.', MAIN),
                ('comic', 'en', "I'd probably reach the other pavement and forget which exit I was looking for.", MAIN),
                ('useful', 'en', "The crossing from above. No, I'm not going to try counting everyone.", None),
                ('comic', 'en', 'train time saved. now to save the time it takes me to find the platform', None),
                ('aesthetic', 'en', 'Rainy crossing photo would be nice. Somewhere dry to stand would be nicer.', None),
                ('history', 'en', 'The crossing opened in 1973. Funny to think it had an ordinary first day.', MAIN),
                ('useful', 'tr', "Çöp kutusu aramadan önce çantamda küçük bir poşet arıyorum. Tokyo'da işe yarayacak bir alışkanlık.", None),
            ], notify=1),
    Capital(id='seoul', city='Seoul', country='KR', place='Myeongdong', anchor=(37.5636, 126.985), coord='approx',
            layout=('line', 30, 60, -3), source="https://www.koreatimes.co.kr/southkorea/20260722/foreign-tourists-increasingly-flock-to-seouls-markets-hiking-spots",
            ar='Myeongdong. I can help you find a street. Choosing a snack is going to take your own judgement.',
            notes=[
                ('comic', 'en', "one skewer, then decide. i'm willing to call that a plan", None),
                ('useful', 'en', 'Leaving room for something from the evening stalls. Exact something still undecided.', None),
                ('comic', 'en', 'I like tiny sample bottles until I have to remember which tiny bottle does what.', W + 'Myeong-dong'),
                ('aesthetic', 'en', "Signs on the upper floors. So much to look at above the bit where I'm walking.", None),
                ('quest', 'en', 'Kamsahamnida. I need to practise before my turn at the counter.', None),
                ('history', 'en', "Myeongdong has been a shopping district for a long time. I still wouldn't know where to start.", W + 'Myeong-dong'),
                ('useful', 'tr', 'Yemek çubuklarını pirince dik bırakmamak gerekiyor. Kullanmayınca yanına koyarım.', None),
            ], notify=1),
    Capital(id='taipei', city='Taipei', country='TW', place='Ximending', anchor=(25.042643, 121.507539), coord='wikipedia',
            layout=('ring', 45), source=W + 'Ximending',
            ar='Ximending has been a pedestrian zone since 1999. You can change direction without changing your whole afternoon.',
            notes=[
                ('comic', 'en', 'bubble tea in one hand. somehow everything else needs two', None),
                ('useful', 'en', 'Ximen MRT saved on the phone. Now I can turn without pretending I remember everything.', None),
                ('history', 'en', "The Red House started as a market. I'd like to compare the doors then and now.", MAIN),
                ('aesthetic', 'en', 'Back after dark? I want to see what the same street looks like then.', None),
                ('quest', 'en', "Xièxie. I'd rather try a small thank you than wait until I can say it perfectly.", None),
                ('comic', 'en', "What are we queuing for? Usually worth asking before I've already waited ten minutes.", None),
                ('useful', 'tr', 'Taipei metrosunda yemek, içmek ve sakız yasak. İçeceği girişten önce bitirmek gerekiyor.', None),
            ], notify=1),
    Capital(id='bangkok', city='Bangkok', country='TH', place='Khao San Road', anchor=(13.75889, 100.49722), coord='wikipedia',
            layout=('line', 85, 55, -3), source=W + 'Khaosan_Road',
            ar='Khaosan means milled rice. The street had a different shopping list once.',
            notes=[
                ('comic', 'en', "music from both ends of the street. my feet haven't picked one", None),
                ('useful', 'en', 'Only 410 metres. I could still make a whole evening of choosing where to stop.', MAIN),
                ('useful', 'en', 'Waterproof bag before Songkran, not a wet phone afterwards. Writing this down for myself.', None),
                ('history', 'en', "The road was built in 1892, during the reign of King Rama V.", MAIN),
                ('aesthetic', 'en', "Let's see it with the neon on too. Then we can decide where to go.", None),
                ('quest', 'en', "Khop khun. A thank you I'd like to get right before I need it.", None),
                ('useful', 'tr', 'Yanımda biri olsa “şuraya da bakalım mı” derdim. Tek başımayken kime soracağımı şaşırıyorum.', None),
            ], notify=2),
    Capital(id='manila', city='Manila', country='PH', place='Binondo', anchor=(14.601, 120.9765), coord='approx',
            layout=('line', 80, 60, -3), source=W + 'Binondo',
            ar='Binondo, founded in 1594. A very old neighbourhood, still making you decide what to have for lunch.',
            notes=[
                ('comic', 'en', 'A few dishes to share. Otherwise choosing lunch could take us through to dinner.', None),
                ('useful', 'en', 'Ongpin Street would be my starting point. Bakery or tea house after that, not decided.', MAIN),
                ('useful', 'en', "Jeepney fare goes forward. I'll watch once before getting my coins muddled.", None),
                ('aesthetic', 'en', 'Red lanterns first, street name second. I know what catches my eye.', None),
                ('comic', 'en', 'dim sum before eleven sounds like a reason to be ready before eleven', None),
                ('quest', 'en', "'Salamat' means thank you in Filipino.", None),
                ('useful', 'tr', '“Salamat po.” Teşekkür ederken bir kelime daha. Bunu aklımda tutabilirim.', None),
            ], notify=0),
    Capital(id='jakarta', city='Jakarta', country='ID', place='Fatahillah Square', anchor=(-6.1351, 106.8132), coord='approx',
            layout=('ring', 40), source=W + 'Fatahillah_Square',
            ar='The old city hall became a museum in 1974. A building can keep its face and change its whole job.',
            notes=[
                ('useful', 'en', 'A car-free square makes it easier to stop and figure out where I am.', MAIN),
                ('comic', 'en', "getting here is a plan. what to do once i'm here is another one", None),
                ('useful', 'en', "Shorter walk at midday. We can do more when it's cooler.", None),
                ('aesthetic', 'en', "One slow look at the old fronts. Photos don't have to be the first thing I do.", None),
                ('quest', 'en', "'Terima kasih' means thank you.", None),
                ('comic', 'en', 'What is that snack? Before I confidently point at it and get asked a second question.', None),
                ('useful', 'tr', 'Bir şey uzatırken sağ elimi kullanmayı hatırlamak istiyorum. Küçük alışkanlıklar daha zor değişiyor.', None),
            ], notify=0),
    Capital(id='kuala-lumpur', city='Kuala Lumpur', country='MY', place='Bukit Bintang', anchor=(3.14583, 101.71111), coord='wikipedia',
            layout=('line', 45, 60, -3), source=W + 'Bukit_Bintang',
            ar="Bukit Bintang. Shops or Jalan Alor first? I'll wait while you decide.",
            notes=[
                ('comic', 'en', 'umbrella packed. somewhere convenient to keep the wet umbrella, less planned', None),
                ('useful', 'en', "Jalan Alor this evening. Don't ask me to choose dinner yet.", MAIN),
                ('useful', 'en', 'An air-conditioned shortcut would be very easy to turn into a long stop.', None),
                ('aesthetic', 'en', 'Skyline photo if it works. Remembering where I looked matters more to me.', None),
                ('quest', 'en', 'Teh tarik pour is something to watch. Carrying a cup without spilling is more my level of ambition.', None),
                ('comic', 'en', 'Durian and public transport need a sign check before I take anything on board.', None),
                ('useful', 'tr', "“Terima kasih.” Aynı teşekkürü Malezya'da da Endonezya'da da kullanabilmek işimi kolaylaştırır.", None),
            ], notify=2),
    Capital(id='singapore', city='Singapore', country='SG', place='Orchard Road', anchor=(1.304833, 103.831833), coord='wikipedia',
            layout=('line', 120, 80, -3), source=W + 'Orchard_Road',
            ar='Orchard Road used to lead to orchards. The name outlasted the trees it referred to.',
            notes=[
                ('useful', 'en', "About 2.5 kilometres of Orchard Road. I'd leave the MRT as an option rather than a defeat.", MAIN),
                ('comic', 'en', 'A long queue makes me curious. It also makes me check how hungry I am.', None),
                ('useful', 'en', 'Snack finished before the MRT. No eating or drinking on the train.', None),
                ('aesthetic', 'en', "Under cover during the rain, outside for the smell after. That's my preference sorted.", None),
                ('quest', 'en', "Laksa, somewhere to sit, phone away for a bit. I can stop planning lunch once it's in front of me.", None),
                ('comic', 'en', 'umbrella and sunscreen. packing for opposite complaints', None),
                ('useful', 'tr', 'Sakızı nereye koyacağımı düşünmek yerine küçük bir kâğıt taşımak daha kolay.', None),
            ], notify=2),
    Capital(id='hanoi', city='Hanoi', country='VN', place='Hoàn Kiếm Lake', anchor=(21.0289, 105.8539), coord='approx',
            layout=('line', 0, 60, -3), source=W + 'Ho%C3%A0n_Ki%E1%BA%BFm_Lake',
            ar="Legend says a golden turtle reclaimed a magic sword here. That's the story behind 'Lake of the Returned Sword'. Chào mừng!",
            notes=[
                ('useful', 'en', 'Hanoi. I want to remember the name of the lake without checking my photos.', None),
                ('useful', 'en', 'Lake road closed today? Checking before treating it as a walking path.', None),
                ('aesthetic', 'en', 'Early morning by the lake sounds good. Setting the alarm is the easier half.', None),
                ('history', 'en', 'Turtle Tower, same sword legend as the lake. Can someone tell me the longer version?', MAIN),
                ('quest', 'en', "Egg coffee. Sounds unusual, but I'm curious enough to give it a go.", None),
                ('comic', 'en', 'tiny stools. deciding how to get down is only half the problem', None),
                ('useful', 'tr', "Hanoi'de karşıya geçmek için güvenli geçidi ve ışıkları kullan. Motorların seni fark ettiğini varsayma.", None),
            ], notify=0),
    Capital(id='new-delhi', city='New Delhi', country='IN', place='Connaught Place', anchor=(28.63278, 77.21972), coord='wikipedia',
            layout=('ring', 60), source=W + 'Connaught_Place,_New_Delhi',
            ar="Connaught Place. CP if you're typing quickly. Rajiv Chowk on the official name list.",
            notes=[
                ('comic', 'en', "I lose my sentence halfway through the traffic noise. Doesn't take this much noise, usually.", None),
                ('useful', 'en', "Rajiv Chowk station is under the central park. I'd still check the exit number.", None),
                ('useful', 'en', "Block letter saved. Inner, Middle, Outer alone won't get me to the right door.", MAIN),
                ('aesthetic', 'en', "Winter evening, warm drink, out of everyone's way. I'd be happy there.", None),
                ('quest', 'en', 'Can we finish the chai before talking about the next stop?', None),
                ('comic', 'en', 'looking at a stall is how i accidentally give myself more things to carry', None),
                ('useful', 'tr', '“Shukriya” demeyi hatırlarım gibi geliyor. Teşekkür edeceğim anda göreceğiz.', None),
            ], notify=2),
    Capital(id='kathmandu', city='Kathmandu', country='NP', place='Thamel', anchor=(27.7151556, 85.3102194), coord='wikipedia',
            layout=('ring', 40), source=W + 'Thamel',
            ar="Thamel. Another turn? I thought you'd ask. I'm still here when you find your way back.",
            notes=[
                ('comic', 'en', 'Standing aside for the map. Walking while figuring it out has never made me quicker.', None),
                ('useful', 'en', "Trekking gear shops are everywhere. Check the zips and seams before you buy.", MAIN),
                ('useful', 'en', 'How many momo on a plate? I need a little help translating a menu into an amount of lunch.', None),
                ('aesthetic', 'en', "Rooftop first. If the hills are hidden, we've still got somewhere to sit.", None),
                ('quest', 'en', 'Namaste for hello, dhanyabad for thanks. Two words I can practise on the way.', None),
                ('comic', 'en', 'singing bowls are difficult to pass without wanting to hear one', None),
                ('useful', 'tr', '“Namaste” deyip selam vermek yeter. Uzun bir şey söylemeye çalışırken asıl selamı unutmayayım.', None),
            ], notify=2),
    Capital(id='washington', city='Washington, D.C.', country='US', place='National Mall', anchor=(38.8897, -77.026), coord='approx',
            layout=('line', 90, 70, -3), source=None,
            ar='Most Smithsonian museums are free to enter. Choosing which one first still costs me an afternoon of planning.',
            notes=[
                ('comic', 'en', 'The Mall fits on my map screen. That is misleadingly convenient.', None),
                ('useful', 'en', 'Closing times before the museum order. I keep leaving the one I want until last.', None),
                ('useful', 'en', 'Water now. Prefer carrying a bit extra to spending the walk thinking about a drink.', None),
                ('aesthetic', 'en', "Turn round occasionally. The view isn't obliged to stay in front of me.", None),
                ('quest', 'en', "One museum, a few things I remember. I'd be happy with that.", None),
                ('comic', 'en', "squirrels seem to know where they're going. i'd like to compare notes", None),
                ('useful', 'tr', 'Bir müze gezisinin planını yapmak hoşuma gidiyor. Kaçıncı salonda fikrimi değiştireceğim planda yok.', None),
            ], notify=0),
    Capital(id='mexico-city', city='Mexico City', country='MX', place='Madero Street', anchor=(19.433617, -99.137296), coord='wikipedia',
            layout=('line', 90, 70, -3), source=W + 'Madero_Street',
            ar='Madero links the Zócalo and Torre Latinoamericana. Plenty of room in a route for changing your mind.',
            notes=[
                ('comic', 'en', "pineapple on the taco. i'd like to try the whole thing before offering an opinion", None),
                ('useful', 'en', "Madero Street. Choosing where to turn could take a while. I'm fine with that.", None),
                ('history', 'en', "The House of Tiles was once a countess's home. I'd have asked far too many questions about cleaning it.", MAIN),
                ('aesthetic', 'en', "I forget to look at balconies when there's this much happening at street level.", None),
                ('quest', 'en', 'Churros and hot chocolate. That changes what I mean by “something small”.', None),
                ('useful', 'en', 'Sunday cycle route on Reforma: check first, make it the plan afterwards.', None),
                ('useful', 'tr', 'Acı için “poquito” demeyi hatırlayayım. Sonra yemeğin üstüne cesaret gösterisi yapmam gerekmiyor.', None),
            ], notify=1),
    Capital(id='buenos-aires', city='Buenos Aires', country='AR', place='Calle Florida', anchor=(-34.59917, -58.37472), coord='wikipedia',
            layout=('line', 350, 70, -3), source=W + 'Florida_Street',
            ar="Calle Florida. Pedestrian all the way since 1971. I'd still need room to stop and check the map.",
            notes=[
                ('comic', 'en', 'A late dinner sounds good until I remember how early I started thinking about it.', None),
                ('useful', 'en', "Ceiling in Galerías Pacífico first. Shops once I've remembered to look down again.", MAIN),
                ('useful', 'en', 'About a kilometre to walk. An unspecified amount of time to spend looking around.', MAIN),
                ('aesthetic', 'en', 'Staying for the end of the tango. Walking off halfway would feel like leaving a sentence unfinished.', MAIN),
                ('quest', 'en', 'What do I do with the mate? Let me ask before I confidently invent a method.', None),
                ('comic', 'en', "i'd rather ask about the portion than pretend i'm going to finish anything", None),
                ('comic', 'tr', '“Che”yi ne zaman söyleyeceğimi dinleyerek öğrenirim. Kelimeyi bilmek başka, yerine oturtmak başka.', None),
            ], notify=0),
    Capital(id='bogota', city='Bogotá', country='CO', place='Carrera Séptima', anchor=(4.59889, -74.07541), coord='approx',
            layout=('line', 15, 70, 0), source=W + 'Carrera_S%C3%A9ptima',
            ar="Carrera Séptima. You don't have to fit the whole street into one walk.",
            notes=[
                ('comic', 'en', 'A layer I can put back on. A bag that has room for it. Ideally both.', None),
                ('useful', 'en', "First day at this altitude. Slow is fine; nobody's marking the walk.", None),
                ('useful', 'en', 'Hot chocolate with cheese. Show me how before I get inventive with it.', None),
                ('aesthetic', 'en', 'Need to remember to look east at the mountains. The phone map keeps getting more of my attention.', None),
                ('quest', 'en', 'One whole song. The rest of the walk can wait that long.', None),
                ('comic', 'en', 'choosing an arepa while already planning what to order next', None),
                ('comic', 'tr', '“¿Qué más?” diye başlayan bir sohbeti anlayabilsem. Devamı için biraz daha kelime gerekiyor.', None),
            ], notify=0),
    Capital(id='lima', city='Lima', country='PE', place='Jirón de la Unión', anchor=(-12.0485, -77.0329), coord='approx',
            layout=('line', 30, 70, -3), source=W + 'Jir%C3%B3n_de_la_Uni%C3%B3n',
            ar="Jirón de la Unión. A street name, a long walk if you want one, a shorter walk if you don't.",
            notes=[
                ('useful', 'en', "Ceviche at lunch. That's one decision made, even if I haven't chosen where.", None),
                ('useful', 'en', 'Towards Plaza San Martín, as far as we feel like. No need to agree a finishing time yet.', MAIN),
                ('history', 'en', "It's been called Jirón de la Unión since 1862.", MAIN),
                ('aesthetic', 'en', 'Wooden balconies get my attention. Building numbers are less lucky.', None),
                ('quest', 'en', "We can have a drink without settling who invented it, can't we?", None),
                ('comic', 'en', "panza de burro. donkey's belly. someone found the words for that grey sky", None),
                ('useful', 'tr', '“Por favor” deyince cümleyi biraz daha rahat kuruyorum. Sonrasını yavaşça anlatabilirim.', None),
            ], notify=0),
    Capital(id='santiago', city='Santiago', country='CL', place='Paseo Ahumada', anchor=(-33.4402, -70.6512), coord='approx',
            layout=('line', 0, 60, -3), source=W + 'Paseo_Ahumada',
            ar='Paseo Ahumada. Plaza de Armas at one end. You can choose the rest a corner at a time.',
            notes=[
                ('comic', 'en', '“ya po” is short. learning when to say it might take longer', None),
                ('useful', 'en', 'The Andes after the rain clears. Looking first, camera later.', None),
                ('useful', 'en', 'Plaza de Armas is at the north end. I like having one direction settled.', MAIN),
                ('aesthetic', 'en', "East near sunset. I'll get the direction settled before trying to admire anything.", None),
                ('quest', 'en', "A completo sounds like something I'd want both hands free for.", None),
                ('comic', 'en', 'I can go out needing nothing and still wonder how to carry something home.', None),
                ('useful', 'tr', 'Çay sofrasına “once” deniyormuş. Saatini tahmin etmek yerine sormak daha iyi.', None),
            ], notify=0),
    Capital(id='ottawa', city='Ottawa', country='CA', place='ByWard Market', anchor=(45.4271, -75.6923), coord='wikipedia',
            layout=('ring', 40), source=W + 'ByWard_Market',
            ar="ByWard Market takes its name from the old By Ward. I'd probably have guessed something about buying things.",
            notes=[
                ('comic', 'en', 'Temperature check before calling this winter walk “a quick one”.', None),
                ('useful', 'en', 'Indoor market or outdoor stalls. Let me see the weather before deciding.', MAIN),
                ('useful', 'en', 'Parliament Hill is close enough to keep as the next stop. Not a promise yet.', None),
                ('aesthetic', 'en', 'Winter photo, warm fingers. Might have to be a very quick photo.', None),
                ('quest', 'en', 'Choosing a maple treat sounds straightforward until I see more than one.', None),
                ('comic', 'en', 'layers i can take off. somewhere to put the layers. i keep forgetting the second part', None),
                ('useful', 'tr', "Ottawa'da bir tabelayı iki dilde okumak hoşuma gider. Anlamayınca öbür tarafına bakarım.", None),
            ], notify=0),
]

# Mirrors containsURL in admin/lib/content-moderation.ts (note: 'Amstel:' reads as a tel: link).
URL = re.compile(r'://|www\.|(?:mailto|javascript|data|tel):|[\w-]{1,253}\.[^\W\d_]{2,63}(?:\b|$)', re.I)


def offset(lat, lng, bearing_deg, distance_m):
    b = math.radians(bearing_deg)
    return (round(lat + distance_m * math.cos(b) / 111_320, 6),
            round(lng + distance_m * math.sin(b) / (111_320 * math.cos(math.radians(lat))), 6))


def positions(anchor, layout):
    lat, lng = anchor
    if layout[0] == 'ring':
        radius = layout[1]
        return [offset(lat, lng, 15 + i * 360 / 7, radius) for i in range(7)]
    _, bearing, step, first = layout
    return [offset(lat, lng, bearing, k * step) if k >= 0 else offset(lat, lng, bearing + 180, -k * step)
            for k in range(first, first + 7)]


def distance(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(math.sqrt(h))


def capital_problems(capital, spots):
    problems = [] if len(capital.notes) == len(spots) else [f"{capital.id}: {len(capital.notes)} notes (need {len(spots)})"]
    problems += [f"{capital.id}-{i}: unknown type {note[0]}" for i, note in enumerate(capital.notes) if note[0] not in TYPES]
    problems += [f"{capital.id}: notes {i} and {j} are {distance(a, b):.0f} m apart"
                 for (i, a), (j, b) in itertools.combinations(enumerate(spots), 2) if distance(a, b) < MIN_SPACING_M]
    return problems


def capital_items(capital, spots):
    common = {'city': capital.city, 'country': capital.country, 'place': capital.place, 'coord': capital.coord}
    ar_lat, ar_lng = capital.ar_at or capital.anchor
    items = [{'id': f'{capital.id}-ar', 'kind': 'ar', 'type': 'talking', 'lang': 'en', 'text': capital.ar,
              'lat': ar_lat, 'lng': ar_lng, 'notify': False, 'source': capital.source, **common}]
    for i, ((kind, lang, text, source), (lat, lng)) in enumerate(zip(capital.notes, spots)):
        items.append({'id': f'{capital.id}-{i + 1:02d}', 'kind': 'note', 'type': kind, 'lang': lang, 'text': text,
                      'lat': lat, 'lng': lng, 'radius_m': NOTE_RADIUS_M, 'notify': i == capital.notify,
                      'source': capital.source if source is MAIN else source, **common})
    return items


def item_problems(item):
    text, problems = item['text'], []
    if len(text) > MAX_TEXT:
        problems.append(f"{item['id']}: {len(text)} characters (limit {MAX_TEXT})")
    if URL.search(text):
        problems.append(f"{item['id']}: looks like a link")
    if not (-90 <= item['lat'] <= 90 and -180 <= item['lng'] <= 180):
        problems.append(f"{item['id']}: bad coordinates")
    return problems


LONG_DASH = re.compile('[\u2013\u2014]')


def style_problems(items, *, check_openers=True):
    """Template tells: long dashes, and the same two opening words on many notes."""
    problems = [f"{i['id']}: use a plain hyphen or a comma, not a long dash" for i in items if LONG_DASH.search(i['text'])]
    openers = Counter(' '.join(re.findall(r"[\w']+", i['text'].lower())[:2]) for i in items)
    if check_openers:
        problems += [f"{count} notes open with '{opener}': vary the wording (max {MAX_SAME_OPENER})"
                     for opener, count in sorted(openers.items()) if count > MAX_SAME_OPENER]
    return problems


def build():
    items, problems = [], []
    for capital in CAPITALS:
        spots = positions(capital.anchor, capital.layout)
        problems += capital_problems(capital, spots)
        items += capital_items(capital, spots)
    problems += [problem for item in items for problem in item_problems(item)]
    problems += style_problems(items)
    ids = [item['id'] for item in items]
    if len(ids) != len(set(ids)):
        problems.append('duplicate ids')
    return {'batch': BATCH, 'author_handle': AUTHOR_HANDLE, 'items': items}, problems


def main():
    data, problems = build()
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        sys.exit(1)
    text = json.dumps(data, ensure_ascii=False, indent=1) + '\n'
    notes = sum(1 for i in data['items'] if i['kind'] == 'note')
    if '--check' in sys.argv:
        with open(OUT, encoding='utf-8') as f:
            if f.read() != text:
                print('world-capitals.json is out of date: run python3 scripts/seed/world_capitals.py', file=sys.stderr)
                sys.exit(1)
    else:
        with open(OUT, 'w', encoding='utf-8') as f:
            f.write(text)
    approx = sorted({i['city'] for i in data['items'] if i['coord'] == 'approx'})
    print(f"{len(CAPITALS)} capitals, {notes} notes, {len(data['items']) - notes} AR posts; approximate anchors: {', '.join(approx)}")


if __name__ == '__main__':
    main()
