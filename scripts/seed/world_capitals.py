#!/usr/bin/env python3
"""Launch seed for the world layer: one busy place in each of 46 capitals, seven location notes
and one approximate AR post each. Writes scripts/seed/world-capitals.json, which the owner loads
with admin/scripts/seed-notes.mjs (dry run first). See docs/release/LAUNCH_SEED.md.

  python3 scripts/seed/world_capitals.py          # validate + write
  python3 scripts/seed/world_capitals.py --check  # validate + file up to date

Rules (launch content plan, 19 Oct 2026): notes never review a business, every fact carries a
source, no links, no jokes about religion, politics, nations or tragedies, at most 220 characters,
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
MAX_TEXT = 220
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
            ar="Everyone calls me Eros. I'm actually Anteros, his brother. Been up here since 1893 and nobody ever checks.",
            notes=[
                ('comic', 'en', "No clowns, no lions. The only circus act here is crossing the road with a suitcase.", None),
                ('comic', 'en', "stopping here to check your map? three people behind you just stopped to check theirs. very london", None),
                ('useful', 'en', "Too busy? Walk one street north. Two minutes later it's half the crowd.", None),
                ('useful', 'en', "The tube station is right under your feet. There are entrances all round the circus, just take the nearest stairs.", MAIN),
                ('history', 'en', "The ads here started in 1908 with a single Perrier sign. Since 2017 it's all one giant curved screen.", MAIN),
                ('aesthetic', 'en', "come back after dark. the screen turns everyone's face a different colour every few seconds and it's weirdly hypnotic", None),
                ('useful', 'tr', "Trafik soldan akıyor, alışana kadar karşıya geçerken iki tarafa da bak. Zaten çoğu geçitte yere 'look right' yazıyorlar.", None),
            ], notify=1),
    Capital(id='paris', city='Paris', country='FR', place='Champs-Élysées', anchor=(48.8699, 2.3076), coord='wikipedia',
            layout=('line', 295, 90, -3), source=W + 'Champs-%C3%89lys%C3%A9es',
            ar="Champs-Élysées means Elysian Fields, where Greek heroes went in the afterlife. You just had to take the metro. Bienvenue au paradis.",
            notes=[
                ('comic', 'en', "walking the whole avenue = cardio. walking it in new shoes = a mistake", None),
                ('comic', 'en', "Every photo here: the Arc in the back, a stranger's elbow in the front.", None),
                ('useful', 'en', "It's 70 m wide. Cross at the lights, never in between. Drivers here are very confident.", MAIN),
                ('useful', 'en', "Want the Arc without 400 people in your shot? Come early, before the shops open.", None),
                ('history', 'en', "The Tour de France used to finish right here, from 1975 to 2023. These days it's mostly strollers racing each other.", MAIN),
                ('aesthetic', 'en', "Stand in the middle at dusk when the street lights come on. Two straight lines all the way up to the Arc.", None),
                ('useful', 'tr', "Paris'te 'bonjour' demeden soru sormak kaba kaçıyor. Önce bonjour, sonra ne soracaksan. Yüzler bir anda yumuşuyor.", None),
            ], notify=2),
    Capital(id='madrid', city='Madrid', country='ES', place='Puerta del Sol', anchor=(40.4169, -3.7035), coord='approx',
            layout=('ring', 45), source=W + 'Puerta_del_Sol',
            ar="You're at Kilometre Zero. Every road distance in Spain is measured from the plaque in this square, so technically everything is far from here. Except you. Todo empieza aquí.",
            notes=[
                ('comic', 'en', "The bear has been reaching for the same strawberry tree for decades. Respect the commitment.", None),
                ('comic', 'en', "On New Year's Eve the whole country eats 12 grapes, one per chime of this clock. Harder than it sounds. Practise with peanuts.", MAIN),
                ('useful', 'en', "No cars here since 2020, but watch out for delivery bikes. They didn't get the memo.", MAIN),
                ('useful', 'en', "meeting someone? 'at the bear' works, everyone knows it. just say which side", None),
                ('history', 'en', "The Kilometre Zero plaque dates from 1857. Millions of feet wore the old one out, so it got swapped in 2009.", MAIN),
                ('aesthetic', 'en', "Around sunset the clock tower turns gold for a few minutes. Then it's gone, so don't be scrolling.", None),
                ('useful', 'tr', "İspanyollar akşam yemeğini 21:00'den önce pek yemez. Acıktıysan tapas, kimse yadırgamaz.", None),
            ], notify=3),
    Capital(id='rome', city='Rome', country='IT', place='Trevi Fountain', anchor=(41.90083, 12.48306), coord='wikipedia',
            layout=('line', 200, 35, 1), source=W + 'Trevi_Fountain',
            ar="Right hand, coin over the left shoulder. Now Rome owes you a return trip. Around €3,000 lands in here every day and all of it goes to charity. Buona fortuna!",
            notes=[
                ('comic', 'en', "Everybody throws a coin, nobody can actually see the water. You can hear it though.", None),
                ('useful', 'en', "Heads up: since February 2026 non-residents pay €2 to go down to the fountain for most of the day. Looking from up top is still free.", MAIN),
                ('useful', 'en', "Before 9 a.m. there's no ticket yet and no crowd yet. Worth setting an alarm.", MAIN),
                ('history', 'en', "Finished in 1762 after 30 years of work. 26 m high, 49 m wide. Somehow the gelato queue still feels longer.", MAIN),
                ('comic', 'en', "your wish goes to rome, your coin goes to charity. honestly not a bad deal", MAIN),
                ('aesthetic', 'en', "At night the stone goes warm and the water sounds louder. Put the phone away for ten minutes.", None),
                ('useful', 'tr', "Dondurmayı külah yerine kapta al. Roma güneşi külahı senden hızlı yiyor.", None),
            ], notify=1),
    Capital(id='berlin', city='Berlin', country='DE', place='Alexanderplatz', anchor=(52.5217, 13.4136), coord='wikipedia',
            layout=('ring', 50), source=W + 'Alexanderplatz',
            ar="I'm the World Clock, been standing here since 1969. I show the time in 148 cities and not one of them says 'five more minutes'.",
            notes=[
                ('comic', 'en', "You can see the TV Tower from almost anywhere in Berlin. Super handy when you're lost, which is everyone.", None),
                ('comic', 'en', "'meet at the world clock' ok but WHICH side. otherwise enjoy your lap around it", None),
                ('useful', 'en', "Alex is a huge transport hub. Follow the U and S signs, they don't lie.", None),
                ('useful', 'en', "Most shops are shut on Sundays here. Buy your snacks on Saturday, trust me.", None),
                ('history', 'en', "It's been called Alexanderplatz since 1805, after Tsar Alexander I came to visit.", MAIN),
                ('quest', 'en', "Read the city names on the World Clock out loud. Cheapest world tour you'll ever do.", MAIN),
                ('comic', 'tr', "Berlin döneri bizimkine pek benzemiyor, sebze ve sos daha bol. Hangisi daha iyi tartışması burada bitmez.", None),
            ], notify=1),
    Capital(id='amsterdam', city='Amsterdam', country='NL', place='Dam & Kalverstraat', anchor=(52.3726, 4.8921), coord='approx',
            layout=('line', 175, 70, 1), ar_at=(52.37305, 4.892), source=W + 'Dam_Square',
            ar="This square started out as a dam on the Amstel. Dam + Amstel = Amsterdam. You're standing on the city's first pun.",
            notes=[
                ('history', 'en', "Kalverstraat means 'calf street'. There was a cattle market here from 1486 to 1629. Today's herd carries shopping bags.", W + 'Kalverstraat'),
                ('comic', 'en', "Here bikes have right of way, trams have right of way, and you have... good luck.", None),
                ('useful', 'en', "Red lane = bike lane. Don't walk in it. First bell is a warning, the second one is personal.", None),
                ('useful', 'en', "kalverstraat is about 750 m of shops from dam to muntplein. the tiny side alleys are where it gets quiet", W + 'Kalverstraat'),
                ('history', 'en', "The palace on Dam was the city hall from 1655 until 1808, then it became a royal palace.", MAIN),
                ('aesthetic', 'en', "Pop into a side alley and look up. The narrow houses lean on each other like they've had a long day.", None),
                ('useful', 'tr', "Bisiklet yolunda yürümek otobanda piknik yapmak gibi. Kırmızı yolu gördün mü, hemen kenara.", None),
            ], notify=2),
    Capital(id='vienna', city='Vienna', country='AT', place='Kärntner Straße', anchor=(48.206, 16.371), coord='wikipedia',
            layout=('line', 25, 70, -3), source=W + 'K%C3%A4rntner_Stra%C3%9Fe',
            ar="This street is named after Carinthia, down south towards Venice and Trieste. You won't make it to Italy on foot, but cake counts as a souvenir.",
            notes=[
                ('comic', 'en', "Car-free since 1974. The only traffic jam left is in front of the cake windows.", MAIN),
                ('useful', 'en', "This street joins Karlsplatz, the Opera and Stephansplatz. Walk it end to end and you've done the classic Vienna stroll.", MAIN),
                ('useful', 'en', "Coffee comes with a glass of water and nobody rushes you. One cup, one hour, totally normal here.", None),
                ('history', 'en', "Back in the 1800s they widened this street from 9 to 17 metres. Still not wide enough on a Saturday.", MAIN),
                ('aesthetic', 'en', "Look towards Stephansplatz around dusk. The cathedral's tiled roof stands out over the street like a carpet.", None),
                ('quest', 'en', "ok challenge: walk past a café window and DON'T count the cakes", None),
                ('useful', 'tr', "Kahve sipariş ederken 'melange' de, Viyanalı gibi görünürsün. Bizim sütlü kahvenin süslüsü.", None),
            ], notify=0),
    Capital(id='prague', city='Prague', country='CZ', place='Old Town Square', anchor=(50.0870083, 14.4209167), coord='wikipedia',
            layout=('line', 40, 40, 1), source=W + 'Prague_astronomical_clock',
            ar="Every hour Death rings the bell and the apostles parade past my windows. Been doing this since 1410. Your phone alarm could never.",
            notes=[
                ('comic', 'en', "Everyone waits for the clock show, films the whole thing, then never watches the video. The clock doesn't mind.", None),
                ('comic', 'en', "prague cobblestones: gorgeous. also the natural enemy of suitcase wheels 🧳", None),
                ('useful', 'en', "Stand a few steps back for the clock show, not right under it. The figures are small, the crowd isn't.", None),
                ('useful', 'en', "Charles Bridge is a short walk west. Follow the crowd there, then lose them in the side streets.", None),
                ('history', 'en', "The clockwork and the astronomical dial go back to 1410, made by Mikuláš of Kadaň and Jan Šindel.", MAIN),
                ('aesthetic', 'en', "Turn around after the show. Those pastel houses look like a cake display for giants.", None),
                ('useful', 'tr', "Trdelník turistik bir tatlı, evet. Ama sıcakken bir tane yemek suç değil.", None),
            ], notify=2),
    Capital(id='budapest', city='Budapest', country='HU', place='Váci utca', anchor=(47.4942222, 19.052425), coord='wikipedia',
            layout=('line', 165, 65, -3), source=W + 'V%C3%A1ci_utca',
            ar="You're on Pest's main walking street. Buda is across the river. Stick them together and you've got the city's name.",
            notes=[
                ('comic', 'en', "Try reading a Hungarian shop sign out loud. Locals appreciate the effort. And the comedy.", None),
                ('useful', 'en', "Váci utca ends at Vörösmarty Square, the easiest meeting point around here.", MAIN),
                ('useful', 'en', "one street over and the cafés go quiet. main street for walking, side streets for sitting", None),
                ('comic', 'en', "Walked the whole street? That's a chimney cake earned. Walked it twice? Two.", None),
                ('hidden', 'en', "Look above the shop windows. Lots of these buildings still have their fancy old top floors.", None),
                ('aesthetic', 'en', "Walk down to the river at night. The bridges light up and the whole city shows up twice in the water.", None),
                ('useful', 'tr', "Macarcada bizden kelimeler var: alma elma, kecske keçi. Bir manavda dene, karşındaki çok şaşıracak.", None),
            ], notify=0),
    Capital(id='lisbon', city='Lisbon', country='PT', place='Rua Augusta', anchor=(38.7084, -9.1368), coord='wikipedia',
            layout=('line', 350, 65, 1), ar_at=(38.7084, -9.1368), source=W + 'Rua_Augusta_Arch',
            ar="This arch was finally finished in 1873, after more than a century of on and off work. Lisbon's way of saying good things take time. Bem-vindo à Baixa.",
            notes=[
                ('comic', 'en', "Lisbon's hills are basically a free gym. Rua Augusta is the warm-up, it's flat.", None),
                ('comic', 'en', "if google maps says 5 min walk in lisbon, add the hill. always add the hill", None),
                ('useful', 'en', "The old yellow trams fill up fast. Go early in the morning if you want a seat.", None),
                ('comic', 'en', "Pastel de nata: one is a snack, two is lunch, three is a personality.", None),
                ('history', 'en', "The top of the arch is more than 30 m up. The statues up there show Glory rewarding Valour and Genius.", MAIN),
                ('aesthetic', 'en', "Walk through the arch towards the river around sunset. The square opens onto the water like a stage.", None),
                ('useful', 'tr', "Teşekkür ederken erkeksen 'obrigado', kadınsan 'obrigada'. Karşındakine göre değil, sana göre değişiyor.", None),
            ], notify=1),
    Capital(id='athens', city='Athens', country='GR', place='Monastiraki', anchor=(37.97639, 23.72361), coord='wikipedia',
            layout=('line', 90, 45, 1), source=W + 'Monastiraki',
            ar="Monastiraki means 'little monastery'. Look up between the roofs, the Acropolis is keeping an eye on everyone. Καλώς ήρθατε.",
            notes=[
                ('comic', 'en', "In Athens your ancient history homework is just... the view from the café.", None),
                ('useful', 'en', "The flea market streets start right here. Haggling is fine, just keep it friendly.", MAIN),
                ('useful', 'en', "July middays are no joke. Water, shade, metro. In that order.", None),
                ('comic', 'en', "every souvenir shop has the same gods on fridge magnets. pick your fave carefully, it says a lot about you", None),
                ('history', 'en', "The square is named after the little Pantanassa church standing in the middle of it.", MAIN),
                ('aesthetic', 'en', "Find a rooftop around here at sunset. The Acropolis turns honey coloured.", None),
                ('comic', 'tr', "Yunancada 'ne' evet demek, 'ohi' hayır. Kafan karışırsa gülümse ve başını salla. Hangi yöne, o ayrı mesele.", None),
            ], notify=1),
    Capital(id='brussels', city='Brussels', country='BE', place='Grand-Place', anchor=(50.84667, 4.3525), coord='wikipedia',
            layout=('ring', 45), ar_at=(50.8449861, 4.3499932), source=W + 'Grand-Place',
            ar="I'm Manneken Pis. 55.5 cm tall, standing here since the 1600s, about a thousand outfits in the wardrobe. Yes, I'm the famous one.",
            notes=[
                ('comic', 'en', "Everyone expects Manneken Pis to be bigger. He's 55.5 cm. Lower your expectations, then walk five minutes.", W + 'Manneken_Pis'),
                ('useful', 'en', "Manneken Pis is about 5 min from here. Just follow the people holding waffles.", W + 'Manneken_Pis'),
                ('history', 'en', "Every two years in August, nearly a million begonias or dahlias get laid out on this square as a flower carpet.", MAIN),
                ('aesthetic', 'en', "Come back at night. The gilded fronts light up and the square feels like a theatre between acts.", None),
                ('comic', 'en', "the town hall tower is 96 m tall and your neck will feel every single one", MAIN),
                ('useful', 'en', "Waffle tip: plain with sugar is how locals eat it. Toppings are allowed. Nobody's judging. Much.", None),
                ('comic', 'tr', "Belçika'da iki waffle var, Brüksel ve Liège. İkisini de yemek araştırma sayılır, vicdanın rahat olsun.", None),
            ], notify=0),
    Capital(id='copenhagen', city='Copenhagen', country='DK', place='Strøget', anchor=(55.6786, 12.5774), coord='wikipedia',
            layout=('line', 60, 70, -3), source=W + 'Str%C3%B8get',
            ar="Hi, I'm the Stork Fountain. The city gave me to a royal couple for their silver wedding in 1894. All I ask from you is a photo.",
            notes=[
                ('comic', 'en', "copenhagen forecast: windy, with a strong chance of cinnamon bun", None),
                ('useful', 'en', "Strøget is 1.1 km of car-free street from City Hall Square to Kongens Nytorv. The side streets are calmer.", MAIN),
                ('history', 'en', "This street went car-free on 17 November 1962. It was only supposed to be a trial.", MAIN),
                ('useful', 'en', "Crossing a bike lane? Look twice. Bikes here are fast and completely silent.", None),
                ('aesthetic', 'en', "Hygge isn't something you buy. It's a candle, a window seat and nowhere to be. Try ten minutes of it.", None),
                ('comic', 'en', "Cyclists here signal with one hand and hold a coffee with the other. Do not attempt at home.", None),
                ('useful', 'tr', "Kopenhag'da bisiklet yolu kutsal. Kaldırım sanıp girersen zil sesiyle uyanırsın, bir daha da girmezsin.", None),
            ], notify=3),
    Capital(id='stockholm', city='Stockholm', country='SE', place='Stortorget', anchor=(59.3246389, 18.071425), coord='wikipedia',
            layout=('ring', 32), source=W + 'Nobel_Prize_Museum',
            ar="This building holds the Nobel Prize Museum and the Swedish Academy. Smart building, smart square. Your selfie raises the average.",
            notes=[
                ('comic', 'en', "The houses here look painted for a postcard. People actually live in them, so wave politely.", None),
                ('useful', 'en', "old town = cobblestones everywhere. shoes first, fashion second", None),
                ('useful', 'en', "Fika is a coffee break with something sweet. Here it's less a break and more a cultural duty.", None),
                ('history', 'en', "The old Stock Exchange on the north side now houses the Nobel Prize Museum and the Nobel Library.", MAIN),
                ('aesthetic', 'en', "Winter afternoons get dark early. The lamps come on and the square starts looking like a Christmas card.", None),
                ('quest', 'en', "Count the house colours around the square. More than five and you're actually paying attention.", None),
                ('comic', 'tr', "İsveç'te fika kahve molası demek, yanında tatlı yoksa fika sayılmıyor. Bugün bir tane hak ettin bence.", None),
            ], notify=2),
    Capital(id='warsaw', city='Warsaw', country='PL', place='Old Town Market Place', anchor=(52.2497, 21.0122), coord='approx',
            layout=('ring', 32), source=W + 'Warsaw_Mermaid',
            ar="I'm Warsaw's Mermaid. Sword up, shield up, since 1855. I took a little break from 1928 to 2000, but I'm back. Still armed.",
            notes=[
                ('comic', 'en', "A mermaid as the city's symbol, nowhere near the sea? The Vistula would like a word.", None),
                ('useful', 'en', "The Old Town is small. The Royal Castle square is only a few minutes' walk away.", None),
                ('history', 'en', "Looks centuries old, right? Most of this square was carefully rebuilt after the Second World War.", None),
                ('aesthetic', 'en', "Stand in the middle and turn around slowly. Every front has its own colour.", None),
                ('useful', 'en', "Pierogi are dumplings with a hundred possible fillings. Get the mixed plate, problem solved.", None),
                ('comic', 'en', "the pigeons here have seen more history than all of us. respect them. guard your pierogi", None),
                ('quest', 'tr', "Lehçe teşekkür 'dziękuję', okunuşu 'cenkuye' gibi. Dilin dolanır ama denediğin için gülümserler.", None),
            ], notify=1),
    Capital(id='dublin', city='Dublin', country='IE', place='Grafton Street', anchor=(53.34139, -6.26028), coord='wikipedia',
            layout=('line', 165, 70, -3), source=W + 'Grafton_Street',
            ar="Buskers here get one hour per spot. Love this song? It's your hour. Hate it? Give it sixty minutes.",
            notes=[
                ('comic', 'en', "Irish weather: four seasons before lunch. Grafton Street: four buskers before the corner.", None),
                ('useful', 'en', "Most of the street has been pedestrian since 1982. The north end near College Green still has traffic, so watch it.", MAIN),
                ('history', 'en', "Molly Malone used to stand at the top of this street. In 2014 she moved round the corner to Suffolk Street.", MAIN),
                ('useful', 'en', "if you stop for a busker, throw them a coin. that's the deal 🎸", None),
                ('aesthetic', 'en', "Walk south to St Stephen's Green. The noise drops and the ducks take over.", None),
                ('comic', 'en', "Grafton Street is about 500 m long. With the buskers it lasts a whole album.", MAIN),
                ('useful', 'tr', "Dublin'de bahşiş şart değil ama sokak müzisyenine bir iki euro atmak şarkıya eşlik etmek gibi.", None),
            ], notify=0),
    Capital(id='belgrade', city='Belgrade', country='RS', place='Knez Mihailova', anchor=(44.8178, 20.4569), coord='approx',
            layout=('line', 315, 75, -3), source=W + 'Knez_Mihailova_Street',
            ar="Pedestrian since 1987, protected since 1964. Keep walking north-west and this street drops you at Kalemegdan for sunset, free of charge. Dobro došli.",
            notes=[
                ('comic', 'en', "Shortest way from Terazije to Kalemegdan. Also the slowest, thanks to the shop windows.", MAIN),
                ('useful', 'en', "Kalemegdan park at the end has THE view: the Sava meeting the Danube.", None),
                ('history', 'en', "The street has carried Prince Mihailo Obrenović's name since 1870.", MAIN),
                ('aesthetic', 'en', "Golden hour here and the old fronts warm up like bread in an oven.", None),
                ('useful', 'en', "Nobody brings the bill until you ask. They're serious about the coffee, relaxed about the check.", None),
                ('comic', 'en', "one more ćevapi never hurt anyone. probably", None),
                ('useful', 'tr', "Sırpçada bizden kelimeler var: čarapa çorap, kašika kaşık. Kulak ver, duyunca gülümseyeceksin.", None),
            ], notify=1),
    Capital(id='sarajevo', city='Sarajevo', country='BA', place='Baščaršija', anchor=(43.85975, 18.43115), coord='approx',
            layout=('ring', 35), source=W + 'Ba%C5%A1%C4%8Dar%C5%A1ija',
            ar="They say if you drink from the Sebilj, you'll come back to Sarajevo. Built in 1753, rebuilt here in 1891. Fill your hand and start planning. Dobro došli.",
            notes=[
                ('comic', 'en', "The pigeons in this square have seniority. You're the guest here.", None),
                ('useful', 'en', "Bosnian coffee is a whole ritual. Pour, wait, sip slowly. Rushing it is the only way to get it wrong.", None),
                ('history', 'en', "Baščaršija goes back to 1462. The name is Turkish: baş (main) and çarşı (market).", MAIN),
                ('aesthetic', 'en', "At dusk the coppersmiths' lane goes amber. Listen for the hammers.", None),
                ('useful', 'en', "ćevapi come in bread with onions. ordering the 'small' one is a polite lie you'll regret", None),
                ('quest', 'en', "Say 'hvala' (thanks) once today and watch people's faces.", None),
                ('useful', 'tr', "Başçarşı adı Türkçeden, baş ve çarşı. Kendini evinde hissedersen şaşırma, herkes öyle hissediyor.", MAIN),
            ], notify=1),
    Capital(id='baku', city='Baku', country='AZ', place='Fountains Square', anchor=(40.37083, 49.83694), coord='wikipedia',
            layout=('ring', 50), source=W + 'Fountains_Square,_Baku',
            ar="This square used to be called Parapet. Then dozens of fountains showed up and the name changed. Simple branding. Xoş gəlmisiniz!",
            notes=[
                ('comic', 'en', "baku wind check: if your hair still looks good, you just got here", None),
                ('useful', 'en', "Nizami Street runs right through here, it's the city's main walking and shopping street.", MAIN),
                ('history', 'en', "The square got a big makeover in 2010, and there's been a Christmas market here since 2013.", MAIN),
                ('aesthetic', 'en', "At night the fountains and the lit-up buildings take over the whole square.", None),
                ('comic', 'en', "Every fountain here is a selfie spot. There are dozens. Good luck choosing.", MAIN),
                ('useful', 'tr', "Azerbaycan Türkçesinde teşekkür 'çox sağ ol'. Bizimkine o kadar yakın ki söylemezsen ayıp olur.", None),
                ('useful', 'tr', "Çay armudu bardakta gelir. Yanında reçel varsa şanslı günündesin.", None),
            ], notify=1),
    Capital(id='tbilisi', city='Tbilisi', country='GE', place='Rustaveli Avenue', anchor=(41.701306, 44.796167), coord='wikipedia',
            layout=('line', 140, 60, -3), source=W + 'Rustaveli_Avenue',
            ar="Rustaveli Avenue, 1.5 km of opera, theatre and history, named after the poet Shota Rustaveli. Walk it slowly. A poet would. გამარჯობა!",
            notes=[
                ('comic', 'en', "Georgian hospitality means you'll be offered more food than is humanly possible. Pace yourself from the first bite.", None),
                ('useful', 'en', "The avenue starts at Freedom Square, and there are metro stations near both ends if your legs give up.", MAIN),
                ('history', 'en', "It has carried the poet Shota Rustaveli's name since 1918.", MAIN),
                ('aesthetic', 'en', "Check out the opera house front. The patterns look like carved lace.", None),
                ('useful', 'en', "khachapuri = bread + cheese + egg. one shared is smart. one each is happiness", None),
                ('quest', 'en', "Learn 'gmadlobt' (thank you). One word, huge smiles.", None),
                ('comic', 'tr', "Gürcüce şerefe 'gaumarjos'. Ama önce haçapuri, sonra şerefe, sıra önemli.", None),
            ], notify=0),
    Capital(id='tashkent', city='Tashkent', country='UZ', place='Amir Timur Square', anchor=(41.3111, 69.2796), coord='approx',
            layout=('ring', 60), source=W + 'Amir_Timur_Square',
            ar="Since 1994 this square has carried Amir Timur's name. Walk the green alleys around it, this is where the city's heart beats. Xush kelibsiz!",
            notes=[
                ('useful', 'en', "The metro stations here look like palaces. Ride one stop just for the ceilings, seriously.", None),
                ('comic', 'en', "uzbek plov portions are measured in generosity, not grams", None),
                ('useful', 'en', "Summers are hot and dry. Carry water and stick to the shade of the trees.", None),
                ('aesthetic', 'en', "In the evening the lights come on and families come out. Grab a bench and people-watch.", None),
                ('quest', 'en', "'Rahmat' means thank you. Works literally everywhere.", None),
                ('comic', 'en', "Melon season here is a whole personality. Someone offers you a slice? The answer is yes.", None),
                ('useful', 'tr', "Özbekçede teşekkür 'rahmat', ekmek 'non'. Ekmeği ters koyma, burada ayıp sayılıyor.", None),
            ], notify=0),
    Capital(id='skopje', city='Skopje', country='MK', place='Old Bazaar', anchor=(41.99837, 21.43472), coord='approx',
            layout=('ring', 40), ar_at=(41.99753, 21.4332), source=W + 'Old_Bazaar,_Skopje',
            ar="People were trading here as early as the 12th century. Bargain politely, history is listening. Добредојдовте.",
            notes=[
                ('useful', 'en', "The Stone Bridge connects the Old Bazaar with Macedonia Square over the Vardar. 12 arches, 15th century.", MAIN),
                ('useful', 'en', "burek for breakfast is a local thing. so is a second burek", None),
                ('useful', 'en', "The lanes twist a lot. If you get lost, head downhill to the river and start again.", None),
                ('aesthetic', 'en', "Find one of the old caravanserai courtyards. The stone arches frame the sky like windows.", MAIN),
                ('quest', 'en', "Stop and watch a jeweller or coppersmith at work for a minute. These crafts go back centuries.", None),
                ('comic', 'en', "500 years of people taking the same photo on the Stone Bridge. Go on, add yours.", MAIN),
                ('useful', 'tr', "Üsküp Çarşısı'nda Türkçe tabela ve Türkçe konuşan esnaf görürsen şaşırma, burada çok normal.", None),
            ], notify=2),
    Capital(id='cairo', city='Cairo', country='EG', place='Khan el-Khalili', anchor=(30.0475, 31.26222), coord='wikipedia',
            layout=('line', 270, 40, 0), source=W + 'Khan_el-Khalili',
            ar="This bazaar started as a khan built between 1382 and 1389. Six centuries of haggling later, the first price is still a conversation, not an offer. أهلاً وسهلاً",
            notes=[
                ('comic', 'en', "Haggling here is a sport. Smile, counter, sip tea, repeat. Losing nicely counts too.", None),
                ('useful', 'en', "The goldsmiths' souq next door is where locals actually buy their gold.", MAIN),
                ('useful', 'en', "these lanes are a maze. pick something on the main street as your landmark and go back to it when (not if) you get lost", None),
                ('history', 'en', "The district is named after Jaharkas al-Khalili, Master of the Stables to Sultan Barquq.", MAIN),
                ('aesthetic', 'en', "After sunset the lanterns come on and the copper starts to shine. The bazaar is a night person.", None),
                ('useful', 'en', "A centuries-old coffeehouse is hiding in these lanes. Mint tea in a glass is the classic order.", MAIN),
                ('useful', 'tr', "Pazarlık burada gelenek, ilk fiyat sohbetin başlangıcı. Acele etme, çay teklif ederlerse iç.", None),
            ], notify=0),
    Capital(id='doha', city='Doha', country='QA', place='Souq Waqif', anchor=(25.28738, 51.53321), coord='wikipedia',
            layout=('ring', 40), source=W + 'Souq_Waqif',
            ar="Souq Waqif means 'the standing market'. Traders used to stand at the gates showing off their goods. You get to sit. That's progress. أهلاً وسهلاً",
            notes=[
                ('comic', 'en', "There's a falcon section in this souq. The birds look at you like they know your credit limit.", MAIN),
                ('useful', 'en', "Evenings are the souq's best hours. Cooler air, shops open, cafés full.", None),
                ('history', 'en', "The souq was restored between 2006 and 2008 and kept its old market feel.", MAIN),
                ('aesthetic', 'en', "Wander around after dark. Lantern light on mud-coloured walls.", None),
                ('useful', 'en', "Dress modestly in public. Covered shoulders and knees is the safe bet.", None),
                ('comic', 'en', "the spice stalls could season a whole city for a year. breathe in, it's free", None),
                ('useful', 'tr', "Doha'da çarşıyı akşam gez. Gündüz sıcağında tek aktivite gölge aramak oluyor, ciddiyim.", None),
            ], notify=0),
    Capital(id='amman', city='Amman', country='JO', place='Rainbow Street', anchor=(31.950618, 35.923107), coord='wikipedia',
            layout=('line', 75, 55, -3), source=W + 'Rainbow_Street',
            ar="Rainbow Street is named after an old cinema, not the sky. At sunset the sky tries its best anyway. أهلاً وسهلاً",
            notes=[
                ('comic', 'en', "Amman is built on hills. Your legs will remember every one of them.", None),
                ('useful', 'en', "Souk Jara market is close by for crafts and snacks.", MAIN),
                ('useful', 'en', "the rooftops around here have views over the old city. go up", MAIN),
                ('aesthetic', 'en', "Look towards downtown at dusk. The lights climb up the hills one by one.", None),
                ('quest', 'en', "Try knafeh. Warm, cheesy, syrupy. Then try not ordering a second one.", None),
                ('history', 'en', "The street runs east from First Circle through old Jabal Amman.", MAIN),
                ('useful', 'tr', "Arapçada teşekkür 'şukran', bizim 'şükran'la akraba. Söyleyince yüzler değişiyor.", None),
            ], notify=0),
    Capital(id='tunis', city='Tunis', country='TN', place='Avenue Habib Bourguiba', anchor=(36.800054, 10.185184), coord='wikipedia',
            layout=('line', 90, 80, -3), source=W + 'Avenue_Habib_Bourguiba',
            ar="1.5 km of tree-lined avenue, people call it the Champs-Élysées of Tunis. At one end Ibn Khaldun stands on his pedestal, still thinking about history. أهلاً وسهلاً",
            notes=[
                ('useful', 'en', "Walk down the middle promenade. Cafés line both sides.", None),
                ('comic', 'en', "Mint tea with pine nuts. If there are nuts floating in your glass, congrats, you ordered right.", None),
                ('useful', 'en', "The medina starts at the west end of the avenue. Keep going past the gate.", None),
                ('aesthetic', 'en', "Evening light on the white buildings makes everything soft.", None),
                ('history', 'en', "The Ibn Khaldun statue went up in 1978, facing the avenue and the lake.", MAIN),
                ('quest', 'en', "shukran or merci, both work here, nobody minds", None),
                ('useful', 'tr', "Tunus'ta çay naneli gelir, çoğu zaman içinde çam fıstığı da olur. Fıstıkları sona sakla.", None),
            ], notify=1),
    Capital(id='nairobi', city='Nairobi', country='KE', place='Kenyatta Avenue', anchor=(-1.2844, 36.8217), coord='approx',
            layout=('line', 100, 70, -3), source=None,
            ar="Nairobi has a national park right on its edge. Somewhere out there a giraffe is also late for a meeting. Karibu!",
            notes=[
                ('useful', 'en', "Matatus are the colourful minibuses. Fun to watch, easier to ride with a local showing you how.", None),
                ('comic', 'en', "Nairobi traffic gives you time to learn Swahili. Start with 'pole pole'. Slowly, slowly.", None),
                ('useful', 'en', "Busy street, big city. Phone in your front pocket.", None),
                ('aesthetic', 'en', "In jacaranda season parts of the city turn purple. Look up.", None),
                ('quest', 'en', "'asante' = thank you. use it a lot", None),
                ('comic', 'en', "Nyama choma (grilled meat) is a social event. You share the meat and the stories.", None),
                ('useful', 'tr', "Svahilice 'jambo' merhaba, 'asante' teşekkürler. İki kelimeyle bile arkadaş ediniyorsun burada.", None),
            ], notify=1),
    Capital(id='accra', city='Accra', country='GH', place='Oxford Street, Osu', anchor=(5.559, -0.1822), coord='approx',
            layout=('line', 0, 70, -3), source=None,
            ar="Oxford Street, Accra. Same name as the one in London, a lot more sunshine. Leave the umbrella at home. Akwaaba!",
            notes=[
                ('comic', 'en', "Jollof is a serious topic here. Have an opinion, defend it with a smile.", None),
                ('useful', 'en', "Days are hot, evenings are lively. Water and shade first, dancing later.", None),
                ('quest', 'en', "Say 'medaase'. That's thank you in Twi.", None),
                ('aesthetic', 'en', "Look out for kente cloth in the shops. Every colour and pattern means something.", None),
                ('useful', 'en', "Tro-tros are shared minibuses. The mate shouts out the route, so ask before you hop on.", None),
                ('comic', 'en', "plantain chips here are dangerous. buy one bag, regret not buying two", None),
                ('comic', 'tr', "Gana'da 'akwaaba' hoş geldin demek. Bu not da sana bir akwaaba.", None),
            ], notify=1),
    Capital(id='tokyo', city='Tokyo', country='JP', place='Shibuya Crossing', anchor=(35.6595, 139.70056), coord='wikipedia',
            layout=('ring', 45), ar_at=(35.659, 139.7006), source=W + 'Shibuya_Crossing',
            ar="Hachikō waited almost ten years for his human. You can wait for one red light. ハチ公は約10年待った。赤信号ひとつ、待てるよね。",
            notes=[
                ('useful', 'en', "Heads up: drinking on the street around here is banned every night from 6 pm to 5 am, since 2024.", MAIN),
                ('comic', 'en', "Green light. Up to 3,000 people. Zero collisions. Tokyo's daily magic trick.", MAIN),
                ('useful', 'en', "Watch the crossing from above at least once. The crowd pattern is the real show.", None),
                ('comic', 'en', "tokyo trains are on time. if you're late it's 100% you", None),
                ('aesthetic', 'en', "Rainy nights here, the screens reflect on the wet road and every umbrella lights up.", None),
                ('history', 'en', "The crossing opened in 1973 and has been in films from Lost in Translation to Tokyo Drift.", MAIN),
                ('useful', 'tr', "Japonya'da sokakta çöp kutusu çok az, çöpünü cebinde taşımak normal. Cep doluyor, şehir tertemiz kalıyor.", None),
            ], notify=1),
    Capital(id='seoul', city='Seoul', country='KR', place='Myeongdong', anchor=(37.5636, 126.985), coord='approx',
            layout=('line', 30, 60, -3), source="https://www.koreatimes.co.kr/southkorea/20260722/foreign-tourists-increasingly-flock-to-seouls-markets-hiking-spots",
            ar="Seoul's number one spot for foreign visitors, about 100,910 a day in 2025. Snack in one hand, phone in the other. 한 손엔 간식, 한 손엔 휴대폰.",
            notes=[
                ('comic', 'en', "myeongdong rule of thumb: one more skewer is always a good idea", None),
                ('useful', 'en', "In the evening the food stalls take over the street. Come hungry.", None),
                ('comic', 'en', "Skincare shops hand out samples. You leave with less money and a bag full of tiny tubes.", W + 'Myeong-dong'),
                ('aesthetic', 'en', "After dark the neon signs stack up the buildings floor by floor.", None),
                ('quest', 'en', "'Kamsahamnida' means thank you. A small bow gets you bonus points.", None),
                ('history', 'en', "Myeongdong has long been one of Seoul's main shopping districts.", W + 'Myeong-dong'),
                ('useful', 'tr', "Kore'de yemek çubuğunu pirince dik saplama, cenaze ritüelini hatırlatıyor. Kenara koy, yeter.", None),
            ], notify=1),
    Capital(id='taipei', city='Taipei', country='TW', place='Ximending', anchor=(25.042643, 121.507539), coord='wikipedia',
            layout=('ring', 45), source=W + 'Ximending',
            ar="Taipei's first pedestrian zone (1999) and still Taiwan's biggest. If a trend exists, it walked through here first. 歡迎",
            notes=[
                ('comic', 'en', "bubble tea research: one cup per block minimum. for science", None),
                ('useful', 'en', "Ximen MRT station is right on the edge of the district.", None),
                ('history', 'en', "The Red House here actually started life as a market building.", MAIN),
                ('aesthetic', 'en', "Come at night. Billboards, street performers, food smells, all at once. The good kind of overload.", None),
                ('quest', 'en', "'Xièxie' means thanks. Shopkeepers love it when you try.", None),
                ('comic', 'en', "Night market rule: see a queue, join it. You'll find out what it's for later.", None),
                ('useful', 'tr', "Taipei metrosunda yemek, içmek ve sakız yasak. Kahveni durakta bitir, ceza yeme.", None),
            ], notify=1),
    Capital(id='bangkok', city='Bangkok', country='TH', place='Khao San Road', anchor=(13.75889, 100.49722), coord='wikipedia',
            layout=('line', 85, 55, -3), source=W + 'Khaosan_Road',
            ar="'Khaosan' means milled rice. This was a rice market long before it became backpacker central. Same street, different hunger. ยินดีต้อนรับ",
            notes=[
                ('comic', 'en', "khao san at midnight: everyone's a dj, nobody's sleeping", None),
                ('useful', 'en', "The street is only 410 m long. Eat early, before the music gets loud.", MAIN),
                ('useful', 'en', "During Songkran (Thai New Year, in April) this street turns into one big water fight. Bag your phone.", None),
                ('history', 'en', "The road was built in 1892, during the reign of King Rama V.", MAIN),
                ('aesthetic', 'en', "At dusk the neon flickers on and the whole street smells like pad thai.", None),
                ('quest', 'en', "'Khop khun' means thank you. Men add 'khrap' at the end, women add 'kha'.", None),
                ('useful', 'tr', "Tayland'da kraliyet ailesi hakkında şaka yapmak ciddi suç, hiç bulaşma. Buradaki tek şaka balık sosunun kokusu olsun.", None),
            ], notify=2),
    Capital(id='manila', city='Manila', country='PH', place='Binondo', anchor=(14.601, 120.9765), coord='approx',
            layout=('line', 80, 60, -3), source=W + 'Binondo',
            ar="Binondo, founded in 1594, the oldest Chinatown in the world. Come hungry, leave a dumpling expert. Maligayang pagdating!",
            notes=[
                ('comic', 'en', "Food crawl tip: share everything. Only way to try ten things before you're full.", None),
                ('useful', 'en', "Ongpin Street is the heart of it. Tea houses, bakeries, dim sum.", MAIN),
                ('useful', 'en', "Jeepneys are Manila's iconic buses. Pass your fare forward, everyone helps out.", None),
                ('aesthetic', 'en', "Watch for the red lanterns over the side streets. At dusk the whole district goes red.", None),
                ('comic', 'en', "dim sum before 11 in the morning is completely normal here. nobody will look at you weird", None),
                ('quest', 'en', "'Salamat' means thank you in Filipino.", None),
                ('useful', 'tr', "Filipinler'de saygı için cümleye 'po' ekleniyor: 'salamat po', çok teşekkürler. Özellikle büyüklere.", None),
            ], notify=0),
    Capital(id='jakarta', city='Jakarta', country='ID', place='Fatahillah Square', anchor=(-6.1351, 106.8132), coord='approx',
            layout=('ring', 40), source=W + 'Fatahillah_Square',
            ar="The old city hall behind you became a history museum in 1974. No cars on this square, so walk like it's a few centuries ago. Selamat datang!",
            notes=[
                ('useful', 'en', "Kota Tua is car-free, maybe the only place in Jakarta where you can walk without dodging scooters.", MAIN),
                ('comic', 'en', "jakarta traffic is legendary. this square is your reward for surviving it", None),
                ('useful', 'en', "Midday heat is serious. The museum halls make a nice cool escape.", None),
                ('aesthetic', 'en', "Late afternoon light makes the old fronts look soft and warm.", None),
                ('quest', 'en', "'Terima kasih' means thank you.", None),
                ('comic', 'en', "Street snacks: point, smile, eat. No language needed.", None),
                ('useful', 'tr', "Endonezya'da bir şey verirken ya da selamlaşırken sağ elini kullan, sol el kaba kaçıyor.", None),
            ], notify=0),
    Capital(id='kuala-lumpur', city='Kuala Lumpur', country='MY', place='Bukit Bintang', anchor=(3.14583, 101.71111), coord='wikipedia',
            layout=('line', 45, 60, -3), source=W + 'Bukit_Bintang',
            ar="Bukit Bintang. Malls on one side, Jalan Alor's hawker food on the other. Choose wisely, or just do both. Selamat datang!",
            notes=[
                ('comic', 'en', "KL weather: sunny, then a tropical downpour, then sunny again. all before dessert", None),
                ('useful', 'en', "Jalan Alor's food street comes alive at night with tables right out on the road.", MAIN),
                ('useful', 'en', "Malls double as air-conditioned shortcuts here. Nobody judges.", None),
                ('aesthetic', 'en', "Look up at night. The skyline turns into one big light show.", None),
                ('quest', 'en', "Order a teh tarik and watch them pour it. The higher the pour, the better the show.", None),
                ('comic', 'en', "Durian: love it or hate it, but never take it on the train.", None),
                ('useful', 'tr', "Malezya'da teşekkür 'terima kasih', Endonezya ile aynı. Tek kelimeyle iki ülke, fena değil.", None),
            ], notify=2),
    Capital(id='singapore', city='Singapore', country='SG', place='Orchard Road', anchor=(1.304833, 103.831833), coord='wikipedia',
            layout=('line', 120, 80, -3), source=W + 'Orchard_Road',
            ar="This road once led to nutmeg, pepper and fruit orchards. Now it leads to air-conditioning. Same name, cooler fruit.",
            notes=[
                ('useful', 'en', "Orchard Road is about 2.5 km long, and the MRT stations along it mean you never have to walk all of it.", MAIN),
                ('comic', 'en', "Singapore logic: a long queue at a food stall means the food is good.", None),
                ('useful', 'en', "No eating or drinking on MRT trains. Finish your snack first, the fines are real.", None),
                ('aesthetic', 'en', "After a rainstorm the trees along the road drip and the air smells green.", None),
                ('quest', 'en', "Find a hawker centre and order laksa. That's the real Orchard Road souvenir.", None),
                ('comic', 'en', "umbrella or sunscreen? in singapore it's both. every day", None),
                ('useful', 'tr', "Singapur'da sakız satılmıyor. Yanında getirdiğinle idare et, yere de sakın atma.", None),
            ], notify=2),
    Capital(id='hanoi', city='Hanoi', country='VN', place='Hoàn Kiếm Lake', anchor=(21.0289, 105.8539), coord='approx',
            layout=('line', 0, 60, -3), source=W + 'Ho%C3%A0n_Ki%E1%BA%BFm_Lake',
            ar="Legend says a golden turtle took back the emperor's magic sword right here, that's why it's the 'Lake of the Returned Sword'. Put your phone away and look. Chào mừng!",
            notes=[
                ('useful', 'en', "Crossing the street in Hanoi: walk slowly and steadily, never run. The scooters flow around you like water.", None),
                ('useful', 'en', "On weekend evenings the streets around the lake often close to traffic and fill up with families.", None),
                ('aesthetic', 'en', "Early morning: tai chi, joggers and mist on the water. Set the alarm.", None),
                ('history', 'en', "The Turtle Tower on the little island belongs to the same sword legend.", MAIN),
                ('quest', 'en', "Try egg coffee. Whipped egg yolk on strong coffee. Sounds wrong, isn't.", None),
                ('comic', 'en', "tiny plastic stools = hanoi's dining chairs. squat like a local, eat like royalty", None),
                ('useful', 'tr', "Hanoi'de karşıya geçerken koşma, sabit hızla yürü. Motorlar seni hesaplıyor, sen sürpriz yapma yeter.", None),
            ], notify=0),
    Capital(id='new-delhi', city='New Delhi', country='IN', place='Connaught Place', anchor=(28.63278, 77.21972), coord='wikipedia',
            layout=('ring', 60), source=W + 'Connaught_Place,_New_Delhi',
            ar="Built between 1929 and 1933, modelled on Bath's Royal Crescent. Officially Rajiv Chowk since 1995, but everyone still says CP. स्वागत है",
            notes=[
                ('comic', 'en', "Delhi traffic is a symphony. Horns in every key, no conductor.", None),
                ('useful', 'en', "Rajiv Chowk metro station is right under the central park.", None),
                ('useful', 'en', "CP is built in circles, Inner, Middle and Outer. Note your block letter or you'll be going round forever.", MAIN),
                ('aesthetic', 'en', "Winter evenings: chai steam, warm lights under the colonnades, a park full of people.", None),
                ('quest', 'en', "Get masala chai from a stall and drink it slowly. It's a pause, not just a drink.", None),
                ('comic', 'en', "every vendor here can sell you something you didn't know you needed. enjoy the show", None),
                ('useful', 'tr', "Hintçede teşekkür 'dhanyavaad', ama 'shukriya' da çok yaygın, bizim 'şükür'le akraba.", None),
            ], notify=2),
    Capital(id='kathmandu', city='Kathmandu', country='NP', place='Thamel', anchor=(27.7151556, 85.3102194), coord='wikipedia',
            layout=('ring', 40), source=W + 'Thamel',
            ar="Welcome to Thamel. Trekking gear, momo and mountain dreams everywhere you look. Everest is out there somewhere, but maybe start with the hotel stairs. नमस्ते",
            notes=[
                ('comic', 'en', "Thamel traffic: a horn means 'hi, I'm here'. Say hi back by stepping aside.", None),
                ('useful', 'en', "Trekking gear shops are everywhere. Check the zips and seams before you buy.", MAIN),
                ('useful', 'en', "Momo are Nepali dumplings, steamed, fried or in soup. One plate is a snack, you'll want two.", None),
                ('aesthetic', 'en', "Get up on a rooftop at sunset. On clear days the hills light up around the valley.", None),
                ('quest', 'en', "'Dhanyabad' is thank you, 'namaste' is hello. That's half the language covered. Kind of.", None),
                ('comic', 'en', "every second shop sells singing bowls. every third shop is testing one right now", None),
                ('useful', 'tr', "Nepal'de birinin başına dokunmak ya da ayakla bir şey göstermek kaba sayılıyor. Selam için 'namaste' yeter.", None),
            ], notify=2),
    Capital(id='washington', city='Washington, D.C.', country='US', place='National Mall', anchor=(38.8897, -77.026), coord='approx',
            layout=('line', 90, 70, -3), source=None,
            ar="Most of the Smithsonian museums around here are free. Your wallet is safe. Your feet, not so much.",
            notes=[
                ('comic', 'en', "The Mall looks walkable on the map. It is. For hours.", None),
                ('useful', 'en', "Museums close in the evening, so do the big one first.", None),
                ('useful', 'en', "Bring water in summer. Shade on the Mall is rare.", None),
                ('aesthetic', 'en', "At sunset the Capitol dome lights up at one end. Turn around for the monument silhouette.", None),
                ('quest', 'en', "Pick one museum, one object, ten minutes. Beats ten museums in a blur.", None),
                ('comic', 'en', "the squirrels here are bold and very well funded", None),
                ('useful', 'tr', "ABD'de restoranda bahşiş neredeyse zorunlu, yüzde 15 ile 20 arası. Müzeler bedava ama akşam yemeği değil.", None),
            ], notify=0),
    Capital(id='mexico-city', city='Mexico City', country='MX', place='Madero Street', anchor=(19.433617, -99.137296), coord='wikipedia',
            layout=('line', 90, 70, -3), source=W + 'Madero_Street',
            ar="Madero Street runs from the Zócalo to the Torre Latinoamericana. Walk it once by day and once by night, you'll meet two different cities. ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "tacos al pastor: the pineapple on top isn't optional, it's destiny", None),
                ('useful', 'en', "The city sits high up in the mountains. Walk slowly and drink water, at least on day one.", None),
                ('history', 'en', "The House of Tiles on this street is covered in blue and white tiles and was once a countess's home.", MAIN),
                ('aesthetic', 'en', "Look up at the balconies, old stone, iron railings, flowers. Then look down at the crowd. Same energy.", None),
                ('quest', 'en', "Try churros with hot chocolate. It's a meal if you say it with confidence.", None),
                ('useful', 'en', "On Sunday mornings Reforma closes to cars and fills up with cyclists.", None),
                ('useful', 'tr', "Meksika'da acı gerçekten acı. 'Poquito picante' (az acılı) demeyi öğren, midene iyilik yap.", None),
            ], notify=1),
    Capital(id='buenos-aires', city='Buenos Aires', country='AR', place='Calle Florida', anchor=(-34.59917, -58.37472), coord='wikipedia',
            layout=('line', 350, 70, -3), source=W + 'Florida_Street',
            ar="Calle Florida, fully pedestrian since 1971, some bits since 1913. In the evening tango shows up uninvited. Let it. ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "Dinner here starts around 10 p.m. Lunch is just the trailer.", None),
                ('useful', 'en', "Galerías Pacífico (1888) has painted ceilings. Go look even if you buy nothing.", MAIN),
                ('useful', 'en', "Florida runs about a kilometre, from near Plaza de Mayo to Plaza San Martín.", MAIN),
                ('aesthetic', 'en', "Evenings bring living statues and tango dancers. Stand still long enough and you might get applause too.", MAIN),
                ('quest', 'en', "If someone offers you mate, say yes. Don't stir the straw, that's the only rule.", None),
                ('comic', 'en', "argentine steak portions are a negotiation between you and your belt", None),
                ('comic', 'tr', "Arjantin'de 'che' samimi bir hitap. '¿Che, todo bien?' dersen yerli gibi durursun.", None),
            ], notify=0),
    Capital(id='bogota', city='Bogotá', country='CO', place='Carrera Séptima', anchor=(4.59889, -74.07541), coord='approx',
            layout=('line', 15, 70, 0), source=W + 'Carrera_S%C3%A9ptima',
            ar="Carrera Séptima. Bolívar Square, old churches, street vendors and music, all in one long walk. Bogotá in a single street. ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "Bogotá weather: sunny, rainy, cold, sunny again, all in one afternoon. Bring layers. And patience.", None),
                ('useful', 'en', "Bogotá is high up in the Andes. Take it easy on day one.", None),
                ('useful', 'en', "Hot chocolate with cheese is a local classic. Drop the cheese in. Trust the process.", None),
                ('aesthetic', 'en', "Look east. The green Andes rise right behind the city.", None),
                ('quest', 'en', "Find a street musician and stay for one full song.", None),
                ('comic', 'en', "pretty sure the arepa is the unit of distance here. 'two arepas away' = close", None),
                ('comic', 'tr', "Kolombiya'da '¿Qué más?' naber demek. Bunu söyle, sohbet kendiliğinden açılır.", None),
            ], notify=0),
    Capital(id='lima', city='Lima', country='PE', place='Jirón de la Unión', anchor=(-12.0485, -77.0329), coord='approx',
            layout=('line', 30, 70, -3), source=W + 'Jir%C3%B3n_de_la_Uni%C3%B3n',
            ar="Pizarro laid out this street in 1535, the year Lima was founded, and it's been the city's main street ever since. You're walking on the original plan. ¡Bienvenidos!",
            notes=[
                ('useful', 'en', "Ceviche is a lunch thing here, when the fish is freshest. Locals are very serious about this.", None),
                ('useful', 'en', "Pedestrian since 1982, the street runs past the Plaza Mayor to Plaza San Martín.", MAIN),
                ('history', 'en', "It's been called Jirón de la Unión since 1862.", MAIN),
                ('aesthetic', 'en', "Look up at the wooden balconies. Lima's colonial lace, carved in wood.", None),
                ('quest', 'en', "Order a pisco sour and decide for yourself where it was invented. Diplomatically.", None),
                ('comic', 'en', "locals call the grey sky 'panza de burro', donkey's belly. poetic AND accurate", None),
                ('useful', 'tr', "Peru'da 'por favor' en az 'gracias' kadar önemli. Kibar bir 'por favor' her kapıyı açıyor.", None),
            ], notify=0),
    Capital(id='santiago', city='Santiago', country='CL', place='Paseo Ahumada', anchor=(-33.4402, -70.6512), coord='approx',
            layout=('line', 0, 60, -3), source=W + 'Paseo_Ahumada',
            ar="Paseo Ahumada, pedestrian since the late 1970s, links Plaza de Armas to the city's main avenue. On clear days the Andes watch you from the east. ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "chileans add 'po' to everything. 'ya po' means... it depends", None),
                ('useful', 'en', "Clear days after rain give you the best Andes views.", None),
                ('useful', 'en', "Plaza de Armas at the north end is the historic heart of the city.", MAIN),
                ('aesthetic', 'en', "At sunset the mountains go pink. Look east.", None),
                ('quest', 'en', "Try a completo, a hot dog with avocado and a lot more. A whole meal in one hand.", None),
                ('comic', 'en', "Street vendors here sell everything, including things you didn't know were for sale.", None),
                ('useful', 'tr', "Şili'de akşam çayına 'once' diyorlar, yani on bir. Ama saat akşam, sorma.", None),
            ], notify=0),
    Capital(id='ottawa', city='Ottawa', country='CA', place='ByWard Market', anchor=(45.4271, -75.6923), coord='wikipedia',
            layout=('ring', 40), source=W + 'ByWard_Market',
            ar="The ByWard Market is named after the old 'By Ward', which was named after engineer John By. Market by day, buzzing by night. Bienvenue!",
            notes=[
                ('comic', 'en', "Ottawa winters are serious. Locals call -15°C 'brisk'.", None),
                ('useful', 'en', "The market buildings are open all year. Outdoor stalls show up when the weather lets them.", MAIN),
                ('useful', 'en', "Parliament Hill is a short walk away.", None),
                ('aesthetic', 'en', "In winter the lights strung over the market streets make the snow glow.", None),
                ('quest', 'en', "Try a maple treat. Think of it as a culture test.", None),
                ('comic', 'en', "winter dressing: layers like an onion. summer: peel them off like a happier onion", None),
                ('useful', 'tr', "Kanada'da tabelalar iki dilli, İngilizce ve Fransızca. Ottawa'da ikisini birden duyarsın, bazen aynı cümlede.", None),
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


def style_problems(items):
    """Template tells: long dashes, and the same two opening words on many notes."""
    problems = [f"{i['id']}: use a plain hyphen or a comma, not a long dash" for i in items if LONG_DASH.search(i['text'])]
    openers = Counter(' '.join(re.findall(r"[\w']+", i['text'].lower())[:2]) for i in items)
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
