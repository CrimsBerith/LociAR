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
"""
import itertools
import json
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
    Capital(id='london', city='London', country='GB', place='Piccadilly Circus', anchor=(51.51000, -0.13444), coord='wikipedia',
            layout=('ring', 45), source=W + 'Piccadilly_Circus',
            ar="Everyone calls me Eros. I'm Anteros, his brother. Up here since 1893 and still nobody checks. —The statue",
            notes=[
                ('comic', 'en', "No clowns, no lions. The only circus act here is crossing the road with a suitcase.", None),
                ('comic', 'en', "London rule: stop here to check your map and three people behind you will stop to check theirs.", None),
                ('useful', 'en', "Need a breather? Step one street north. Two minutes' walk, half the crowd.", None),
                ('useful', 'en', "Piccadilly Circus tube station is right under your feet, with several entrances around the circus.", MAIN),
                ('history', 'en', "The ads here began in 1908 with one Perrier sign. Since 2017 it's a single giant curved screen.", MAIN),
                ('aesthetic', 'en', "Come back after dark: the big screen paints every face in the crowd a new colour every few seconds.", None),
                ('useful', 'tr', "Londra'da trafik soldan akar. Karşıya geçerken önce sağa bak; çoğu geçitte yere yazılı.", None),
            ], notify=6),
    Capital(id='paris', city='Paris', country='FR', place='Champs-Élysées', anchor=(48.8699, 2.3076), coord='wikipedia',
            layout=('line', 295, 90, -3), source=W + 'Champs-%C3%89lys%C3%A9es',
            ar="Champs-Élysées = Elysian Fields, the Greek paradise for heroes. You made it. Shopping bags count as armour. / Les sacs de shopping comptent comme une armure.",
            notes=[
                ('comic', 'en', "Walking the whole avenue counts as cardio. Walking it in new shoes counts as a sacrifice.", None),
                ('comic', 'en', "Every photo here has the Arc in the background and somebody's elbow in the foreground.", None),
                ('useful', 'en', "The avenue is 70 m wide. Cross at the lights, not between them: the traffic here is very confident.", MAIN),
                ('useful', 'en', "Best Arc photo: early morning, before the shops open and the pavements fill.", None),
                ('history', 'en', "From 1975 to 2023 the Tour de France finished on this avenue. Today's racers: you and a stroller.", MAIN),
                ('aesthetic', 'en', "At dusk the street lights run in two straight lines all the way to the Arc. Stand still for one minute.", None),
                ('useful', 'tr', "Burada 'bonjour' demeden soru sormak, kapıyı çalmadan girmek gibi. Önce bonjour, sonra soru.", None),
            ], notify=3),
    Capital(id='madrid', city='Madrid', country='ES', place='Puerta del Sol', anchor=(40.41690, -3.70350), coord='approx',
            layout=('ring', 45), source=W + 'Puerta_del_Sol',
            ar="You're at Kilometre Zero: Spain's road distances are measured from the plaque in this square. Everything is far from here, except you. / Todo empieza aquí.",
            notes=[
                ('comic', 'en', "Madrid's bear has been reaching for the same strawberry tree for decades. That's commitment.", None),
                ('comic', 'en', "On New Year's Eve Spain eats twelve grapes to this clock's chimes. Practise now; it's harder than it looks.", MAIN),
                ('useful', 'en', "The square has been car-free since 2020. Walk freely, but keep an eye out for delivery bikes.", MAIN),
                ('useful', 'en', "Meeting someone? 'At the bear' is the easiest meeting point in town. Say which side.", None),
                ('history', 'en', "The Kilometre Zero plaque dates from 1857. The old one wore out under millions of feet and was replaced in 2009.", MAIN),
                ('aesthetic', 'en', "Look up at the clock tower at sunset: the façade turns gold and the square slows down for a second.", None),
                ('useful', 'tr', "İspanya'da akşam yemeği geç yenir; 21:00 erken sayılır. Acıktıysan tapasla idare et.", None),
            ], notify=3),
    Capital(id='rome', city='Rome', country='IT', place='Trevi Fountain', anchor=(41.90083, 12.48306), coord='wikipedia',
            layout=('line', 200, 35, 1), source=W + 'Trevi_Fountain',
            ar="Right hand, over the left shoulder. One coin and Rome owes you a return trip. About €3,000 lands here every day; it all goes to charity. / Buona fortuna!",
            notes=[
                ('comic', 'en', "Trevi rule: everyone throws a coin and nobody can see the water. You'll hear it, though.", None),
                ('useful', 'en', "Since February 2026 non-residents need a €2 ticket to go down to the fountain for most of the day. Looking from the top is free.", MAIN),
                ('useful', 'en', "Come before 9 a.m.: the ticket rule hasn't started yet and neither has the crowd.", MAIN),
                ('history', 'en', "Finished in 1762 after thirty years of work: 26 m high and 49 m wide. Your gelato queue is shorter. Probably.", MAIN),
                ('comic', 'en', "Your wish goes to Rome, your coin goes to charity. Best deal in the city.", MAIN),
                ('aesthetic', 'en', "At night the stone turns warm gold and the water sounds louder. Ten quiet minutes here beat any photo.", None),
                ('useful', 'tr', "Dondurmayı külahta değil kapta iste; yazın Roma güneşi seninle yarışır.", None),
            ], notify=1),
    Capital(id='berlin', city='Berlin', country='DE', place='Alexanderplatz', anchor=(52.5217, 13.4136), coord='wikipedia',
            layout=('ring', 50), source=W + 'Alexanderplatz',
            ar="I show the time in 148 cities. None of them is 'five more minutes'. —World Clock, since 1969",
            notes=[
                ('comic', 'en', "The TV Tower is visible from almost everywhere in Berlin, which makes it the city's favourite landmark for the lost.", None),
                ('comic', 'en', "Meeting 'at the World Clock'? Say which side, or enjoy a scenic lap around it.", None),
                ('useful', 'en', "Alexanderplatz is a big transport hub: follow the U and S signs and they'll never lie to you.", None),
                ('useful', 'en', "Most shops close on Sundays in Germany. Plan your snacks on Saturday.", None),
                ('history', 'en', "The square got its name in 1805, after Tsar Alexander I visited Berlin.", MAIN),
                ('quest', 'en', "Stand under the World Clock and read the city names out loud. Free world tour, ninety seconds.", MAIN),
                ('comic', 'tr', "Berlin döneri Türkiye'dekinden farklı: sebze ve sos bol. Kıyaslamak serbest, tartışmak tatlı.", None),
            ], notify=2),
    Capital(id='amsterdam', city='Amsterdam', country='NL', place='Dam & Kalverstraat', anchor=(52.37260, 4.89210), coord='approx',
            layout=('line', 175, 70, 1), ar_at=(52.37305, 4.89200), source=W + 'Dam_Square',
            ar="This square began as a dam on the Amstel. Dam plus Amstel makes Amsterdam. You're standing on the city's first pun.",
            notes=[
                ('history', 'en', "Kalverstraat means 'calf street': a cattle market ran here from 1486 to 1629. Today's herd: shoppers.", W + 'Kalverstraat'),
                ('comic', 'en', "In Amsterdam bikes have right of way, trams have right of way, and you have good luck.", None),
                ('useful', 'en', "Bike lanes are usually red. Don't walk in them: the first bell is a warning, the second one is personal.", None),
                ('useful', 'en', "Kalverstraat runs about 750 m from Dam to Muntplein. The side alleys hide the quiet corners.", W + 'Kalverstraat'),
                ('history', 'en', "The palace on Dam was the city hall from 1655 until 1808, when it became a royal residence.", MAIN),
                ('aesthetic', 'en', "Step into a side alley and look up: narrow houses lean on each other like old friends.", None),
                ('useful', 'tr', "Burada bisiklet yolunda yürümek otobanda piknik yapmak gibi. Kırmızı yoldan uzak dur.", None),
            ], notify=2),
    Capital(id='vienna', city='Vienna', country='AT', place='Kärntner Straße', anchor=(48.206, 16.371), coord='wikipedia',
            layout=('line', 25, 70, -3), source=W + 'K%C3%A4rntner_Stra%C3%9Fe',
            ar="This street is named after Carinthia, down south towards Venice and Trieste. You won't reach Italy on foot, but cake counts as a souvenir.",
            notes=[
                ('comic', 'en', "Car-free since 1974. The only traffic jam here forms in front of the cake windows.", MAIN),
                ('useful', 'en', "This street links Karlsplatz, the State Opera and Stephansplatz. Walk it end to end and you've done the classic.", MAIN),
                ('useful', 'en', "Coffee here comes with a glass of water, and one cup can last an hour. That's tradition, not rudeness.", None),
                ('history', 'en', "In the 19th century this street was widened from 9 to 17 metres.", MAIN),
                ('aesthetic', 'en', "Look towards Stephansplatz at dusk: the cathedral's patterned roof glows above the street like a carpet.", None),
                ('quest', 'en', "Find a café window and count the cakes. If you stop at ten, you have remarkable willpower.", None),
                ('useful', 'tr', "Viyana'da kahve siparişi bir sanat: 'Melange' de, yerli gibi görün.", None),
            ], notify=1),
    Capital(id='prague', city='Prague', country='CZ', place='Old Town Square', anchor=(50.0870083, 14.4209167), coord='wikipedia',
            layout=('line', 40, 40, 1), source=W + 'Prague_astronomical_clock',
            ar="On the hour, Death rings the bell and the apostles parade past the windows. Been doing it since 1410. Your phone alarm could never.",
            notes=[
                ('comic', 'en', "Everyone waits for the clock show, films it, then watches it later on the phone. The clock doesn't mind.", None),
                ('comic', 'en', "Prague's cobblestones are beautiful and the natural enemy of wheeled suitcases.", None),
                ('useful', 'en', "Best view of the clock show: a few steps back, not right underneath. The figures are small; the crowd is not.", None),
                ('useful', 'en', "Charles Bridge is a short walk west. Follow the crowd there, then lose it in the side streets.", None),
                ('history', 'en', "The clock's mechanism and astronomical dial date to 1410, made by Mikuláš of Kadaň and Jan Šindel.", MAIN),
                ('aesthetic', 'en', "Turn around after the show: the square's pastel façades look like a cake display for giants.", None),
                ('useful', 'tr', "Prag'da 'trdelník' turistik bir tatlı ama sıcakken affedilir. Dene, sonra karar ver.", None),
            ], notify=2),
    Capital(id='budapest', city='Budapest', country='HU', place='Váci utca', anchor=(47.4942222, 19.0524250), coord='wikipedia',
            layout=('line', 165, 65, -3), source=W + 'V%C3%A1ci_utca',
            ar="You're on Pest's main walking street. Buda is across the river. Put them together and you get the city's name.",
            notes=[
                ('comic', 'en', "Try reading a Hungarian shop sign out loud. Locals will appreciate the effort and the comedy.", None),
                ('useful', 'en', "Váci utca opens onto Vörösmarty Square: an easy meeting point.", MAIN),
                ('useful', 'en', "One street over, the cafés get quieter. The main street is for walking; the side streets are for sitting.", None),
                ('comic', 'en', "Walk the whole street and you've earned a chimney cake. Walk it twice and you've earned two.", None),
                ('hidden', 'en', "Look above the shop windows: many buildings here keep their old ornate upper floors.", None),
                ('aesthetic', 'en', "Walk to the river at night: the bridges light up and the city doubles in the water.", None),
                ('useful', 'tr', "Macarcada Türkçeden kelimeler var: 'alma' elma, 'kecske' keçi. Bir dükkânda dene!", None),
            ], notify=1),
    Capital(id='lisbon', city='Lisbon', country='PT', place='Rua Augusta', anchor=(38.7084, -9.1368), coord='wikipedia',
            layout=('line', 350, 65, 1), ar_at=(38.7084, -9.1368), source=W + 'Rua_Augusta_Arch',
            ar="This arch took from 1755 to 1873 to finish. Lisbon rebuilt itself; the arch just took its time. / Bem-vindo à Baixa.",
            notes=[
                ('comic', 'en', "Lisbon's hills are a free gym membership. Rua Augusta is the flat warm-up.", None),
                ('useful', 'en', "Rua Augusta is flat, which is rare in Lisbon. Use it to recover before the next hill.", None),
                ('useful', 'en', "The famous old trams fill up fast. Ride early in the morning if you want a seat.", None),
                ('comic', 'en', "Pastel de nata maths: one is a snack, two is lunch, three is a lifestyle.", None),
                ('history', 'en', "The arch's top cornice rises more than 30 m. Its statues show Glory rewarding Valour and Genius.", MAIN),
                ('aesthetic', 'en', "Walk through the arch to the river at sunset: the square opens onto the water like a stage.", None),
                ('useful', 'tr', "Portekizcede teşekkür 'obrigado' ya da 'obrigada'; seçim konuşanın cinsiyetine göre.", None),
            ], notify=1),
    Capital(id='athens', city='Athens', country='GR', place='Monastiraki', anchor=(37.97639, 23.72361), coord='wikipedia',
            layout=('line', 90, 45, 1), source=W + 'Monastiraki',
            ar="Monastiraki means 'little monastery'. Look up between the roofs: the Acropolis keeps an eye on everyone. / Καλώς ήρθατε.",
            notes=[
                ('comic', 'en', "Athens: where your ancient-history homework becomes the view from your coffee table.", None),
                ('useful', 'en', "The flea-market streets start right here. Bargaining is fine; keep it friendly.", MAIN),
                ('useful', 'en', "Summer middays are seriously hot. Water, shade and the metro are your best friends.", None),
                ('comic', 'en', "Every souvenir shop sells the same gods on fridge magnets. Choose your favourite god wisely.", None),
                ('history', 'en', "The square takes its name from the small Church of the Pantanassa that stands in it.", MAIN),
                ('aesthetic', 'en', "From the rooftops around here, sunset turns the Acropolis honey-coloured.", None),
                ('comic', 'tr', "Yunancada 'evet' demek 'ne'. Kafan karışırsa gülümse ve başını salla; ama hangi yöne?", None),
            ], notify=2),
    Capital(id='brussels', city='Brussels', country='BE', place='Grand-Place', anchor=(50.84667, 4.35250), coord='wikipedia',
            layout=('ring', 45), ar_at=(50.8449861, 4.3499932), source=W + 'Grand-Place',
            ar="I'm 55.5 cm tall, I've stood here since the 1600s and I own about a thousand outfits. Yes, I'm the most famous one in Brussels. —Manneken Pis",
            notes=[
                ('comic', 'en', "Everyone expects Manneken Pis to be bigger. He's 55.5 cm. Manage expectations, then walk five minutes.", W + 'Manneken_Pis'),
                ('useful', 'en', "Manneken Pis is about five minutes' walk from here. Follow the people holding waffles.", W + 'Manneken_Pis'),
                ('history', 'en', "Every two years in August, nearly a million begonias or dahlias cover this square as a flower carpet.", MAIN),
                ('aesthetic', 'en', "Come back at night: the gilded façades glow and the square feels like a theatre between acts.", None),
                ('comic', 'en', "The Town Hall tower is 96 m tall. Your neck will feel every metre of it.", MAIN),
                ('useful', 'en', "Waffle tip: plain with sugar is the local way. Toppings are allowed; nobody is watching. Almost.", None),
                ('comic', 'tr', "Belçika'da iki waffle var: Brüksel ve Liège. İkisini de denemek araştırma sayılır.", None),
            ], notify=1),
    Capital(id='copenhagen', city='Copenhagen', country='DK', place='Strøget', anchor=(55.6786, 12.5774), coord='wikipedia',
            layout=('line', 60, 70, -3), source=W + 'Str%C3%B8get',
            ar="1894: a city gives a royal couple a fountain for their silver wedding. Today: you give it a photo. Fair trade. —Stork Fountain",
            notes=[
                ('comic', 'en', "Copenhagen weather forecast: windy, with a strong chance of cinnamon bun.", None),
                ('useful', 'en', "Strøget is 1.1 km of car-free street from City Hall Square to Kongens Nytorv. The side streets are calmer.", MAIN),
                ('history', 'en', "This street went car-free on 17 November 1962, first as a trial. It stuck.", MAIN),
                ('useful', 'en', "Crossing a bike lane? Look twice. The bikes here are fast and silent.", None),
                ('aesthetic', 'en', "Hygge isn't a product: it's a candle, a window seat and nowhere to be. Try it for ten minutes.", None),
                ('comic', 'en', "Copenhagen cyclists signal with one hand and hold a coffee with the other. Don't try this at home.", None),
                ('useful', 'tr', "Kopenhag'da bisiklet yolu kutsal; kaldırımla karıştırırsan zil sesiyle uyanırsın.", None),
            ], notify=3),
    Capital(id='stockholm', city='Stockholm', country='SE', place='Stortorget', anchor=(59.3246389, 18.0714250), coord='wikipedia',
            layout=('ring', 32), source=W + 'Nobel_Prize_Museum',
            ar="This building houses the Nobel Prize Museum and the Swedish Academy. Smart building, smart square. Your selfie raises the average.",
            notes=[
                ('comic', 'en', "The colourful houses here look painted for a postcard. The people inside call them home.", None),
                ('useful', 'en', "Cobblestones everywhere in the old town. Shoes first, fashion second.", None),
                ('useful', 'en', "Fika is a coffee break with something sweet. Here it's not optional; it's culture.", None),
                ('history', 'en', "The old Stock Exchange on the square's north side now holds the Nobel Prize Museum and the Nobel Library.", MAIN),
                ('aesthetic', 'en', "Winter afternoons get dark early; the lamps around the square make the façades glow like lanterns.", None),
                ('quest', 'en', "Count the colours of the houses around the square. More than five means you're really looking.", None),
                ('comic', 'tr', "İsveç'te 'fika' kahve molası demek; tatlısız fika eksik sayılır. Bugün bir tane hak ettin.", None),
            ], notify=2),
    Capital(id='warsaw', city='Warsaw', country='PL', place='Old Town Market Place', anchor=(52.24970, 21.01220), coord='approx',
            layout=('ring', 32), source=W + 'Warsaw_Mermaid',
            ar="I've guarded Warsaw with a sword and a shield since 1855. Took a break from 1928 to 2000. Back now, still armed. —The Mermaid",
            notes=[
                ('comic', 'en', "A mermaid as a city symbol, far from the sea? The Vistula river would like a word.", None),
                ('useful', 'en', "The Old Town is compact: the Royal Castle square is only a few minutes' walk away.", None),
                ('history', 'en', "This square looks centuries old. Much of it was carefully rebuilt after the Second World War.", None),
                ('aesthetic', 'en', "Stand in the middle and turn slowly: every façade has its own colour and its own story.", None),
                ('useful', 'en', "Try pierogi, dumplings with endless fillings. Ordering a mixed plate is a valid strategy.", None),
                ('comic', 'en', "The pigeons here have seen more history than all of us. Respect them, but guard your pierogi.", None),
                ('quest', 'tr', "Lehçe teşekkür 'dziękuję' (cenkuye diye okunur). Zor ama denediğin için gülümseyecekler.", None),
            ], notify=1),
    Capital(id='dublin', city='Dublin', country='IE', place='Grafton Street', anchor=(53.34139, -6.26028), coord='wikipedia',
            layout=('line', 165, 70, -3), source=W + 'Grafton_Street',
            ar="Buskers here get one hour per performance. Love this song? This is your hour. Don't? Give it sixty minutes.",
            notes=[
                ('comic', 'en', "Irish weather: four seasons before lunch. Grafton Street: four buskers before the corner.", None),
                ('useful', 'en', "Most of the street has been pedestrian since 1982; the north end near College Green still has traffic.", MAIN),
                ('history', 'en', "Molly Malone's statue stood at the top of this street for years. In 2014 she moved round the corner to Suffolk Street.", MAIN),
                ('useful', 'en', "Tip the buskers you stop for. The street's whole soundtrack runs on it.", None),
                ('aesthetic', 'en', "Walk south to St Stephen's Green: the noise drops and the ducks take over.", None),
                ('comic', 'en', "Grafton Street is 500 m long. With buskers it lasts about a full album.", MAIN),
                ('useful', 'tr', "Dublin'de bahşiş zorunlu değil ama sokak müzisyenine birkaç euro, şarkıya katılmak gibidir.", None),
            ], notify=3),
    Capital(id='belgrade', city='Belgrade', country='RS', place='Knez Mihailova', anchor=(44.81780, 20.45690), coord='approx',
            layout=('line', 315, 75, -3), source=W + 'Knez_Mihailova_Street',
            ar="Pedestrian since 1987, protected since 1964. Follow it north-west and it delivers you to Kalemegdan's sunset, free of charge. / Dobro došli.",
            notes=[
                ('comic', 'en', "This is the shortest route from Terazije to Kalemegdan, and the slowest, thanks to the shop windows.", MAIN),
                ('useful', 'en', "Kalemegdan park at the end has the classic view: the Sava meets the Danube.", None),
                ('history', 'en', "The street has carried Prince Mihailo Obrenović's name since 1870.", MAIN),
                ('aesthetic', 'en', "Walk it at golden hour: the old façades warm up like bread in an oven.", None),
                ('useful', 'en', "Cafés here are serious about coffee and relaxed about bills. Ask when you want to pay.", None),
                ('comic', 'en', "Street rule: one more ćevapi never hurt anyone. Probably.", None),
                ('useful', 'tr', "Belgrad'da Türkçeden geçmiş kelimeler duyarsın: 'čarapa' çorap, 'kašika' kaşık. Kulak kabart!", None),
            ], notify=1),
    Capital(id='sarajevo', city='Sarajevo', country='BA', place='Baščaršija', anchor=(43.85975, 18.43115), coord='approx',
            layout=('ring', 35), source=W + 'Ba%C5%A1%C4%8Dar%C5%A1ija',
            ar="Legend says whoever drinks from the Sebilj comes back to Sarajevo. Built in 1753, rebuilt here in 1891. Fill your hand, then make plans. / Dobro došli.",
            notes=[
                ('comic', 'en', "The pigeons in this square have seniority. You're a guest; act accordingly.", None),
                ('useful', 'en', "Bosnian coffee is a ritual: pour, wait, sip slowly. Rushing it is the only wrong move.", None),
                ('history', 'en', "Baščaršija dates from 1462. The name comes from Turkish: 'baş' (main) and 'çarşı' (market).", MAIN),
                ('aesthetic', 'en', "At dusk the coppersmiths' lane turns amber. Listen for the hammers.", None),
                ('useful', 'en', "Ćevapi come in bread with onion. Ordering 'small' is a polite lie you'll regret.", None),
                ('quest', 'en', "Say 'hvala' (thank you) once today and watch faces light up.", None),
                ('useful', 'tr', "Başçarşı adı Türkçeden: baş ve çarşı. Burada kendini evinde hissetmen çok normal.", MAIN),
            ], notify=6),
    Capital(id='baku', city='Baku', country='AZ', place='Fountains Square', anchor=(40.37083, 49.83694), coord='wikipedia',
            layout=('ring', 50), source=W + 'Fountains_Square,_Baku',
            ar="This square used to be called Parapet. Then came dozens of fountains and a new name. Simple branding: call it what you see. / Xoş gəlmisiniz!",
            notes=[
                ('comic', 'en', "Baku wind check: if your hair still looks neat, you've only just arrived.", None),
                ('useful', 'en', "Nizami Street runs right through here: the city's favourite walking and shopping street.", MAIN),
                ('history', 'en', "The square was renovated in 2010 and has hosted a Christmas market since 2013.", MAIN),
                ('aesthetic', 'en', "Come at night: fountains plus lit façades make the whole square glow.", None),
                ('comic', 'en', "Every fountain here is a selfie spot. Choose one; there are dozens.", MAIN),
                ('useful', 'tr', "Azerbaycan Türkçesinde teşekkür 'çox sağ ol'. Söyle, en güzel hediye bu.", None),
                ('useful', 'tr', "Bakü'de çay armut biçimli 'armudu' bardakta gelir; yanında reçel varsa şanslısın.", None),
            ], notify=5),
    Capital(id='tbilisi', city='Tbilisi', country='GE', place='Rustaveli Avenue', anchor=(41.701306, 44.796167), coord='wikipedia',
            layout=('line', 140, 60, -3), source=W + 'Rustaveli_Avenue',
            ar="Rustaveli Avenue: 1.5 km of opera, theatre and history, named after the poet Shota Rustaveli. Walk it slowly; a poet would. / გამარჯობა!",
            notes=[
                ('comic', 'en', "Georgian hospitality rule: you'll be offered more food than you can eat. Pace yourself from bite one.", None),
                ('useful', 'en', "The avenue starts at Freedom Square. Metro stations near both ends save your legs.", MAIN),
                ('history', 'en', "The avenue has carried poet Shota Rustaveli's name since 1918.", MAIN),
                ('aesthetic', 'en', "Look up at the opera house façade: its patterns look like carved lace.", None),
                ('useful', 'en', "Khachapuri is bread, cheese and egg. One shared is smart; one each is joy.", None),
                ('quest', 'en', "Say 'gmadlobt' (thank you). One word, big smiles.", None),
                ('comic', 'tr', "Gürcistan'da şerefe 'gaumarjos'. Ama önce bir haçapuri, sonra şerefe.", None),
            ], notify=1),
    Capital(id='tashkent', city='Tashkent', country='UZ', place='Amir Timur Square', anchor=(41.31110, 69.27960), coord='approx',
            layout=('ring', 60), source=W + 'Amir_Timur_Square',
            ar="Since 1994 this square has carried Amir Timur's name. Walk the green alleys around it; the city's heart beats here. / Xush kelibsiz!",
            notes=[
                ('useful', 'en', "Tashkent's metro stations are decorated like palaces. Ride one stop just for the ceilings.", None),
                ('comic', 'en', "Uzbek plov portions are measured in generosity, not grams.", None),
                ('useful', 'en', "Summer days are hot and dry: carry water and walk in the shade of the trees.", None),
                ('aesthetic', 'en', "In the evening the lights come on and families stroll. Sit on a bench and watch the city.", None),
                ('quest', 'en', "Say 'rahmat' (thank you). It works everywhere.", None),
                ('comic', 'en', "Melon season here is a whole personality. If someone offers you a slice, the answer is yes.", None),
                ('useful', 'tr', "Özbekçede teşekkür 'rahmat', ekmek 'non'. Ekmeği ters koymamak gelenektir.", None),
            ], notify=0),
    Capital(id='skopje', city='Skopje', country='MK', place='Old Bazaar', anchor=(41.99837, 21.43472), coord='approx',
            layout=('ring', 40), ar_at=(41.99753, 21.43320), source=W + 'Old_Bazaar,_Skopje',
            ar="Merchants worked here as early as the 12th century. Bargain politely; history is listening. / Добредојдовте.",
            notes=[
                ('useful', 'en', "The Stone Bridge links the Old Bazaar to Macedonia Square across the Vardar: 12 arches, 15th century.", MAIN),
                ('useful', 'en', "Burek for breakfast is a local institution. So is a second burek.", None),
                ('useful', 'en', "The lanes twist; if you get lost, walk downhill to the river and start again.", None),
                ('aesthetic', 'en', "Find an old caravanserai courtyard: the stone arches frame the sky like windows.", MAIN),
                ('quest', 'en', "Watch a jeweller or coppersmith at work for one minute. Crafts here go back centuries.", None),
                ('comic', 'en', "The Stone Bridge has seen 500 years of people taking the same photo. Add yours to the archive.", MAIN),
                ('useful', 'tr', "Üsküp Çarşısı'nda Türkçe tabela ve Türkçe konuşan esnaf görmen sürpriz olmasın.", None),
            ], notify=6),
    Capital(id='cairo', city='Cairo', country='EG', place='Khan el-Khalili', anchor=(30.04750, 31.26222), coord='wikipedia',
            layout=('line', 270, 40, 0), source=W + 'Khan_el-Khalili',
            ar="This bazaar began as a khan built in 1382–1389. Six centuries of haggling: the first price is a conversation, not an offer. / أهلاً وسهلاً",
            notes=[
                ('comic', 'en', "Haggling here is a sport: smile, counter, sip tea, repeat. Losing gracefully also counts.", None),
                ('useful', 'en', "The goldsmiths' souq next door is where locals still buy gold.", MAIN),
                ('useful', 'en', "The lanes are a maze. Pick a landmark on the main street and return to it if you get lost.", None),
                ('history', 'en', "The district is named after Jaharkas al-Khalili, Master of the Stables to Sultan Barquq.", MAIN),
                ('aesthetic', 'en', "After sunset the lanterns come on and the copper shines. The bazaar wakes up at night.", None),
                ('useful', 'en', "A centuries-old coffeehouse hides in these lanes. Mint tea in a glass is the classic order.", MAIN),
                ('useful', 'tr', "Burada pazarlık gelenek: ilk fiyat bir sohbetin başlangıcı. Gülümsemeyi unutma.", None),
            ], notify=2),
    Capital(id='doha', city='Doha', country='QA', place='Souq Waqif', anchor=(25.28738, 51.53321), coord='wikipedia',
            layout=('ring', 40), source=W + 'Souq_Waqif',
            ar="Souq Waqif means 'the standing market': traders once stood at the gates to show their goods. Today you can sit. Progress. / أهلاً وسهلاً",
            notes=[
                ('comic', 'en', "There's a falcon area in this souq. The birds look at you like they know your credit limit.", MAIN),
                ('useful', 'en', "Evenings are the souq's best hours: cooler air, open shops, busy cafés.", None),
                ('history', 'en', "Restored between 2006 and 2008, the souq kept its old-market feel.", MAIN),
                ('aesthetic', 'en', "Wander the lanes after dark: lantern light on earth-coloured walls.", None),
                ('useful', 'en', "Dress modestly in public places: covered shoulders and knees are a safe choice.", None),
                ('comic', 'en', "The spice stalls could season a city for a year. Breathe in; it's free.", None),
                ('useful', 'tr', "Doha'da çarşıyı akşam gez; gündüz sıcağında asıl aktivite gölge aramak olur.", None),
            ], notify=4),
    Capital(id='amman', city='Amman', country='JO', place='Rainbow Street', anchor=(31.950618, 35.923107), coord='wikipedia',
            layout=('line', 75, 55, -3), source=W + 'Rainbow_Street',
            ar="Rainbow Street is named after an old cinema, not the sky. Still, at sunset, the sky tries its best. / أهلاً وسهلاً",
            notes=[
                ('comic', 'en', "Amman is built on hills. Your legs will remember every single one.", None),
                ('useful', 'en', "Souk Jara market is close by for crafts and snacks.", MAIN),
                ('useful', 'en', "The rooftop restaurants here have the best views over the old city.", MAIN),
                ('aesthetic', 'en', "Look towards downtown at dusk: the lights climb the hills like a slow wave.", None),
                ('quest', 'en', "Try knafeh: warm, cheesy, syrupy. Then try not to order a second one.", None),
                ('history', 'en', "The street runs east from First Circle through historic Jabal Amman.", MAIN),
                ('useful', 'tr', "Arapçada teşekkür 'şukran'; Türkçedeki 'şükran' ile akraba. Kullan, işe yarıyor.", None),
            ], notify=1),
    Capital(id='tunis', city='Tunis', country='TN', place='Avenue Habib Bourguiba', anchor=(36.800054, 10.185184), coord='wikipedia',
            layout=('line', 90, 80, -3), source=W + 'Avenue_Habib_Bourguiba',
            ar="1.5 km of tree-lined avenue, often compared to the Champs-Élysées. At one end, Ibn Khaldun stands on his pedestal, thinking about history. / أهلاً وسهلاً",
            notes=[
                ('useful', 'en', "The central promenade is the best place to walk; cafés line both sides.", None),
                ('comic', 'en', "Mint tea with pine nuts: if your glass has nuts floating in it, congratulations, you ordered right.", None),
                ('useful', 'en', "The medina starts at the avenue's west end. Keep walking past the gate.", None),
                ('aesthetic', 'en', "Evening light on the white façades turns everything soft gold.", None),
                ('history', 'en', "The Ibn Khaldun statue was unveiled in 1978, facing the avenue and the lake.", MAIN),
                ('quest', 'en', "Say 'shukran' or 'merci'; both work here.", None),
                ('useful', 'tr', "Tunus'ta çay nane ve çoğu zaman çam fıstığıyla gelir; bardaktaki fıstıkları kaçırma.", None),
            ], notify=0),
    Capital(id='nairobi', city='Nairobi', country='KE', place='Kenyatta Avenue', anchor=(-1.28440, 36.82170), coord='approx',
            layout=('line', 100, 70, -3), source=None,
            ar="Nairobi has a national park on its edge. Somewhere out there, a giraffe is also late for a meeting. / Karibu!",
            notes=[
                ('useful', 'en', "Matatus are Nairobi's colourful minibuses. Fun to watch, easier to ride with a local's tips.", None),
                ('comic', 'en', "Nairobi traffic gives you time to learn Swahili. Start with 'pole pole': slowly, slowly.", None),
                ('useful', 'en', "Busy street, big city: keep your phone in a front pocket.", None),
                ('aesthetic', 'en', "In jacaranda season parts of the city turn purple. Look up.", None),
                ('quest', 'en', "Say 'asante' (thank you). It opens doors.", None),
                ('comic', 'en', "Nyama choma, grilled meat, is a social event. Portions are for sharing, and so are stories.", None),
                ('useful', 'tr', "Svahilice 'jambo' merhaba, 'asante' teşekkürler. İki kelimeyle bile dost kazanırsın.", None),
            ], notify=2),
    Capital(id='accra', city='Accra', country='GH', place='Oxford Street, Osu', anchor=(5.55900, -0.18220), coord='approx',
            layout=('line', 0, 70, -3), source=None,
            ar="Oxford Street, Accra: same name as London's, more sunshine, better rhythm. No umbrella needed. / Akwaaba!",
            notes=[
                ('comic', 'en', "Jollof debates in West Africa are serious. Have an opinion, defend it with a smile.", None),
                ('useful', 'en', "Daytime heat is real; evenings here are lively. Water and shade first, dancing later.", None),
                ('quest', 'en', "Say 'medaase' (thank you in Twi).", None),
                ('aesthetic', 'en', "Look for kente cloth in the shops: every colour and pattern carries a meaning.", None),
                ('useful', 'en', "Tro-tros are shared minibuses; the mate calls out the route. Ask before you board.", None),
                ('comic', 'en', "Plantain chips here are dangerously good. Buy one bag, regret not buying two.", None),
                ('comic', 'tr', "Gana'da 'akwaaba' hoş geldin demek. Şimdi sen de bir 'akwaaba' aldın.", None),
            ], notify=1),
    Capital(id='tokyo', city='Tokyo', country='JP', place='Shibuya Crossing', anchor=(35.65950, 139.70056), coord='wikipedia',
            layout=('ring', 45), ar_at=(35.65900, 139.70060), source=W + 'Shibuya_Crossing',
            ar="Hachikō waited almost ten years for his human. You can wait one red light. / ハチ公は約10年待った。赤信号ひとつ、待てるよね。",
            notes=[
                ('useful', 'en', "Street drinking is banned around here every night from 6 pm to 5 am, since 2024. Plan your can accordingly.", MAIN),
                ('comic', 'en', "Green light. Up to 3,000 people. Zero collisions. Tokyo's daily magic trick.", MAIN),
                ('useful', 'en', "Watch the crossing from above at least once: the pattern of the crowd is the real show.", None),
                ('comic', 'en', "Tokyo trains run on time. If you're late, it's definitely you.", None),
                ('aesthetic', 'en', "Night rain here: the screens reflect on the wet road and every umbrella turns into a lantern.", None),
                ('history', 'en', "The crossing opened in 1973 and has starred in films from Lost in Translation to Tokyo Drift.", MAIN),
                ('useful', 'tr', "Japonya'da sokak çöp kutusu az; çöpünü yanında taşımak normal. Cebin dolar, şehir temiz kalır.", None),
            ], notify=0),
    Capital(id='seoul', city='Seoul', country='KR', place='Myeongdong', anchor=(37.56360, 126.98500), coord='approx',
            layout=('line', 30, 60, -3),
            source='https://www.koreatimes.co.kr/southkorea/20260722/foreign-tourists-increasingly-flock-to-seouls-markets-hiking-spots',
            ar="Seoul's #1 spot for foreign visitors: about 100,910 a day in 2025. Snack in one hand, phone in the other. / 한 손엔 간식, 한 손엔 휴대폰.",
            notes=[
                ('comic', 'en', "Myeongdong street-food maths: one more skewer is always a good idea.", None),
                ('useful', 'en', "Evenings are when the food stalls take over the street. Come hungry.", None),
                ('useful', 'en', "Skincare shops hand out samples. Your bag gets lighter in money and heavier in tiny tubes.", W + 'Myeong-dong'),
                ('aesthetic', 'en', "After dark the neon signs stack up the buildings like a vertical festival.", None),
                ('quest', 'en', "Say 'kamsahamnida' (thank you). Bonus points for a small bow.", None),
                ('history', 'en', "Myeongdong has long been one of Seoul's main shopping districts.", W + 'Myeong-dong'),
                ('useful', 'tr', "Kore'de yemek çubuklarını pirince dik saplama; cenaze ritüelini andırır.", None),
            ], notify=6),
    Capital(id='taipei', city='Taipei', country='TW', place='Ximending', anchor=(25.042643, 121.507539), coord='wikipedia',
            layout=('ring', 45), source=W + 'Ximending',
            ar="Taipei's first pedestrian zone (1999) and still Taiwan's largest. If a trend exists, it walked through here first. / 歡迎",
            notes=[
                ('comic', 'en', "Bubble-tea research: one cup per block is the minimum scientific standard.", None),
                ('useful', 'en', "Ximen MRT station sits right at the edge of the district.", None),
                ('history', 'en', "The Red House here started life as a market building.", MAIN),
                ('aesthetic', 'en', "Come at night: billboards, street performers and food smells all at once. Overload, the good kind.", None),
                ('quest', 'en', "Say 'xièxie' (thank you). Shopkeepers love the effort.", None),
                ('comic', 'en', "Night-market rule: if there's a queue, join it. You'll find out what it's for later.", None),
                ('useful', 'tr', "Taipei metrosunda yemek, içmek ve sakız çiğnemek yasak. Kahveni durakta bitir.", None),
            ], notify=6),
    Capital(id='bangkok', city='Bangkok', country='TH', place='Khao San Road', anchor=(13.75889, 100.49722), coord='wikipedia',
            layout=('line', 85, 55, -3), source=W + 'Khaosan_Road',
            ar="'Khaosan' means milled rice: this was a rice market before it became the world's backpacker crossroads. Same street, different hunger. / ยินดีต้อนรับ",
            notes=[
                ('comic', 'en', "Khao San at midnight: everyone is a DJ and nobody is sleeping.", None),
                ('useful', 'en', "The street is only 410 m long. Eat early in the evening, before the music gets loud.", MAIN),
                ('useful', 'en', "During Songkran, Thai New Year in April, this street becomes a giant water fight. Waterproof your phone.", None),
                ('history', 'en', "The road was built in 1892, during the reign of Rama V.", MAIN),
                ('aesthetic', 'en', "At dusk the neon flickers on and the smell of pad thai fills the air.", None),
                ('quest', 'en', "Say 'khop khun' (thank you): add 'khrap' if you're a man, 'kha' if you're a woman.", None),
                ('useful', 'tr', "Tayland'da kraliyet hakkında şaka yapmak ciddi suç. Buradaki tek şaka balık sosunun kokusu olsun.", None),
            ], notify=6),
    Capital(id='manila', city='Manila', country='PH', place='Binondo', anchor=(14.60100, 120.97650), coord='approx',
            layout=('line', 80, 60, -3), source=W + 'Binondo',
            ar="Binondo, founded in 1594: the oldest Chinatown in the world. Come hungry; leave a dumpling expert. / Maligayang pagdating!",
            notes=[
                ('comic', 'en', "Food-crawl rule: share everything. It's the only way to taste ten things before you're full.", None),
                ('useful', 'en', "Ongpin Street is the heart of it: tea houses, bakeries and dim sum.", MAIN),
                ('useful', 'en', "Jeepneys are Manila's iconic buses. Pass your fare forward; everyone helps.", None),
                ('aesthetic', 'en', "Look for red lanterns over the side streets; at dusk they make the district glow.", None),
                ('history', 'en', "Binondo was established in 1594, making it the oldest Chinatown in the world.", MAIN),
                ('quest', 'en', "Say 'salamat' (thank you in Filipino).", None),
                ('useful', 'tr', "Filipinler'de saygı için 'po' eklenir: 'salamat po', yani çok teşekkürler.", None),
            ], notify=1),
    Capital(id='jakarta', city='Jakarta', country='ID', place='Fatahillah Square', anchor=(-6.13510, 106.81320), coord='approx',
            layout=('ring', 40), source=W + 'Fatahillah_Square',
            ar="The old city hall behind you became a history museum in 1974. The square is car-free, so walk like it's a few centuries ago. / Selamat datang!",
            notes=[
                ('useful', 'en', "Kota Tua is car-free: the best place in Jakarta to walk without dodging scooters.", MAIN),
                ('comic', 'en', "Jakarta traffic is legendary. This square is your reward for surviving it.", None),
                ('useful', 'en', "Midday heat is strong; museum halls make a cool escape.", None),
                ('aesthetic', 'en', "Late-afternoon light makes the old façades warm and soft.", None),
                ('quest', 'en', "Say 'terima kasih' (thank you).", None),
                ('comic', 'en', "Street snacks here: point, smile, eat. Language optional.", None),
                ('useful', 'tr', "Endonezya'da selamlaşırken ve bir şey uzatırken sağ eli kullan; sol el kaba sayılır.", None),
            ], notify=0),
    Capital(id='kuala-lumpur', city='Kuala Lumpur', country='MY', place='Bukit Bintang', anchor=(3.14583, 101.71111), coord='wikipedia',
            layout=('line', 45, 60, -3), source=W + 'Bukit_Bintang',
            ar="Bukit Bintang: malls on one side, Jalan Alor's hawker food on the other. Choose wisely, or choose both. / Selamat datang!",
            notes=[
                ('comic', 'en', "KL weather: sunny, then a tropical downpour, then sunny again. All before dessert.", None),
                ('useful', 'en', "Jalan Alor's food street comes alive at night with open-air tables.", MAIN),
                ('useful', 'en', "Malls double as air-conditioned shortcuts here. Nobody will judge you.", None),
                ('aesthetic', 'en', "Look up at night: the skyline lights up like a city-sized lantern show.", None),
                ('quest', 'en', "Say 'terima kasih' (thank you in Malay).", None),
                ('comic', 'en', "Durian rule: love it or hate it, but never take it on the train.", None),
                ('useful', 'tr', "Malezya'da teşekkür 'terima kasih', Endonezya ile aynı. Tek kelimeyle iki ülke.", None),
            ], notify=1),
    Capital(id='singapore', city='Singapore', country='SG', place='Orchard Road', anchor=(1.304833, 103.831833), coord='wikipedia',
            layout=('line', 120, 80, -3), source=W + 'Orchard_Road',
            ar="This road once led to nutmeg, pepper and fruit orchards. Now it leads to air-conditioning. Same name, cooler fruit.",
            notes=[
                ('useful', 'en', "Orchard Road is about 2.5 km long; MRT stations along it mean you never have to walk all of it.", MAIN),
                ('comic', 'en', "Singapore rule: a queue at a food stall means the food is worth it.", None),
                ('useful', 'en', "No eating or drinking on MRT trains. Finish your snack first.", None),
                ('aesthetic', 'en', "After a rainstorm the trees along the road drip and the air smells green.", None),
                ('quest', 'en', "Find a hawker centre and order laksa. That's the real Orchard Road souvenir.", None),
                ('comic', 'en', "Umbrella or sunscreen? In Singapore the answer is both, every day.", None),
                ('useful', 'tr', "Singapur'da sakız satılmaz; yanında getirdiğinle yetin ve yere atma.", None),
            ], notify=2),
    Capital(id='hanoi', city='Hanoi', country='VN', place='Hoàn Kiếm Lake', anchor=(21.02890, 105.85390), coord='approx',
            layout=('line', 0, 60, -3), source=W + 'Ho%C3%A0n_Ki%E1%BA%BFm_Lake',
            ar="Legend: a golden turtle took back the emperor's magic sword here. Hence 'Lake of the Returned Sword'. Put your phone away and look. / Chào mừng!",
            notes=[
                ('useful', 'en', "Crossing a Hanoi street: walk slowly and steadily. Scooters flow around you like water. Never sprint.", None),
                ('useful', 'en', "On weekend evenings, streets around the lake often close to traffic and fill with families.", None),
                ('aesthetic', 'en', "Early morning: tai chi, joggers and mist on the water. Worth the alarm.", None),
                ('history', 'en', "The Turtle Tower on the little island is tied to the same sword legend.", MAIN),
                ('quest', 'en', "Try egg coffee: whipped egg yolk on strong coffee. Sounds wrong, tastes right.", None),
                ('comic', 'en', "Tiny plastic stools are Hanoi's dining chairs. Squat like a local, eat like royalty.", None),
                ('useful', 'tr', "Hanoi'de karşıya geçerken koşma; sabit hızla yürü, motorlar seni hesaplar.", None),
            ], notify=0),
    Capital(id='new-delhi', city='New Delhi', country='IN', place='Connaught Place', anchor=(28.63278, 77.21972), coord='wikipedia',
            layout=('ring', 60), source=W + 'Connaught_Place,_New_Delhi',
            ar="Built 1929–1933 and modelled on Bath's Royal Crescent. Officially Rajiv Chowk since 1995; everyone still says CP. / स्वागत है",
            notes=[
                ('comic', 'en', "Delhi traffic is a symphony: horns in every key, no conductor.", None),
                ('useful', 'en', "Rajiv Chowk metro station sits right under the central park.", None),
                ('useful', 'en', "CP is built in circles: Inner, Middle and Outer. Note your block letter or circle forever.", MAIN),
                ('aesthetic', 'en', "Winter evenings: chai steam, warm lights in the colonnades and a park full of people.", None),
                ('quest', 'en', "Order masala chai from a stall and drink it slowly. It's a pause, not a drink.", None),
                ('comic', 'en', "Every vendor here can sell you something you didn't know you needed. Enjoy the show.", None),
                ('useful', 'tr', "Hindistan'da teşekkür 'dhanyavaad'; 'shukriya' da yaygın ve Türkçedeki 'şükür'le akraba.", None),
            ], notify=2),
    Capital(id='kathmandu', city='Kathmandu', country='NP', place='Thamel', anchor=(27.7151556, 85.3102194), coord='wikipedia',
            layout=('ring', 40), source=W + 'Thamel',
            ar="Thamel: trekking gear, momo and mountain dreams in every direction. Everest is out there somewhere. Start with the hotel stairs. / नमस्ते",
            notes=[
                ('comic', 'en', "Thamel traffic rule: a horn means 'hello, I'm here'. Say hello back by stepping aside.", None),
                ('useful', 'en', "Trekking gear shops are everywhere; test zips and seams before you buy.", MAIN),
                ('useful', 'en', "Momo are Nepali dumplings: steamed, fried or in soup. One plate is a snack; you'll want two.", None),
                ('aesthetic', 'en', "Climb to a rooftop at sunset; on clear days the hills glow around the valley.", None),
                ('quest', 'en', "Say 'dhanyabad' (thank you) and 'namaste' (hello).", None),
                ('comic', 'en', "Every second shop sells singing bowls. Every third shop is testing one right now.", None),
                ('useful', 'tr', "Nepal'de birinin başına dokunmak ve ayakla bir şey göstermek kaba sayılır. 'Namaste' ile selamlaş.", None),
            ], notify=6),
    Capital(id='washington', city='Washington, D.C.', country='US', place='National Mall', anchor=(38.88970, -77.02600), coord='approx',
            layout=('line', 90, 70, -3), source=None,
            ar="Most Smithsonian museums around here are free. Your budget is safe; your feet are not.",
            notes=[
                ('comic', 'en', "The Mall looks walkable on the map. It is. For hours.", None),
                ('useful', 'en', "Museums close in the evening; see the big one first.", None),
                ('useful', 'en', "Bring water in summer: shade on the Mall is precious.", None),
                ('aesthetic', 'en', "At sunset the Capitol dome glows at one end of the Mall. Turn around for the monument silhouette.", None),
                ('quest', 'en', "Pick one museum, one object, ten minutes. Better than ten museums in a blur.", None),
                ('comic', 'en', "The squirrels here are bold and very well funded.", None),
                ('useful', 'tr', "ABD'de restoranda bahşiş neredeyse zorunlu (yüzde 15–20). Müzeler ücretsiz, akşam yemeği değil.", None),
            ], notify=1),
    Capital(id='mexico-city', city='Mexico City', country='MX', place='Madero Street', anchor=(19.433617, -99.137296), coord='wikipedia',
            layout=('line', 90, 70, -3), source=W + 'Madero_Street',
            ar="Madero Street runs from the Zócalo to the Torre Latinoamericana. Walk it once by day and once by night: two different cities. / ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "Tacos al pastor: the pineapple on top is not optional; it's destiny.", None),
                ('useful', 'en', "Mexico City sits high in the mountains: walk slowly and drink water.", None),
                ('history', 'en', "The House of Tiles on this street is covered in blue-and-white tiles and was once a countess's home.", MAIN),
                ('aesthetic', 'en', "Look up at the balconies: colonial stone, iron railings, flowers. Then look down at the crowd: same energy.", None),
                ('quest', 'en', "Try churros with hot chocolate. It's a meal if you say it confidently.", None),
                ('useful', 'en', "On Sunday mornings Reforma avenue closes to cars for cyclists.", None),
                ('useful', 'tr', "Meksika'da acı gerçekten acı; 'poquito picante' (az acılı) demeyi öğren.", None),
            ], notify=1),
    Capital(id='buenos-aires', city='Buenos Aires', country='AR', place='Calle Florida', anchor=(-34.59917, -58.37472), coord='wikipedia',
            layout=('line', 350, 70, -3), source=W + 'Florida_Street',
            ar="Calle Florida: fully pedestrian since 1971, some stretches since 1913. In the evening tango shows up uninvited. Let it. / ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "Dinner in Buenos Aires starts around 10 p.m. Lunch is just a long trailer.", None),
                ('useful', 'en', "Galerías Pacífico, from 1888, has painted ceilings worth a look even if you buy nothing.", MAIN),
                ('useful', 'en', "Florida runs about a kilometre, from near Plaza de Mayo to Plaza San Martín.", MAIN),
                ('aesthetic', 'en', "Evenings bring living statues and tango dancers. Stand still yourself; you might get applause.", MAIN),
                ('quest', 'en', "If someone offers you mate, accept. Don't stir the straw: that's the only rule you need.", None),
                ('comic', 'en', "Argentine steak portions are a negotiation between you and your belt.", None),
                ('comic', 'tr', "Arjantin'de 'che' samimi bir hitap: '¿Che, todo bien?' dersen yerli gibi durursun.", None),
            ], notify=2),
    Capital(id='bogota', city='Bogotá', country='CO', place='Carrera Séptima', anchor=(4.59889, -74.07541), coord='approx',
            layout=('line', 15, 70, 0), source=W + 'Carrera_S%C3%A9ptima',
            ar="Carrera Séptima: Bolívar Square, old churches, street vendors and music in one long walk. Bogotá in one street. / ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "Bogotá weather: sunny, rainy, cold, sunny, all in one afternoon. Bring layers and patience.", None),
                ('useful', 'en', "Bogotá is high in the Andes: take it easy on day one.", None),
                ('useful', 'en', "Hot chocolate with cheese is a local classic. Drop the cheese in. Trust the process.", None),
                ('aesthetic', 'en', "Look east: the green Andes rise right behind the city.", None),
                ('quest', 'en', "Find a street musician and stay for one full song.", None),
                ('comic', 'en', "The arepa is the official unit of distance here. 'Two arepas away' means close.", None),
                ('comic', 'tr', "Kolombiya'da '¿Qué más?' 'naber?' demek. Samimiyetin anahtarı bu.", None),
            ], notify=1),
    Capital(id='lima', city='Lima', country='PE', place='Jirón de la Unión', anchor=(-12.04850, -77.03290), coord='approx',
            layout=('line', 30, 70, -3), source=W + 'Jir%C3%B3n_de_la_Uni%C3%B3n',
            ar="Pizarro laid out this street in 1535, the year Lima was founded. It's been the city's main axis ever since. You're walking on the original plan. / ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "Ceviche rule: eat it at lunch, when the fish is freshest. Locals take this very seriously.", None),
                ('useful', 'en', "Pedestrian since 1982, the street runs past the Plaza Mayor to Plaza San Martín.", MAIN),
                ('history', 'en', "The street got its current name in 1862.", MAIN),
                ('aesthetic', 'en', "Look up at the wooden balconies: Lima's colonial lace, carved in wood.", None),
                ('quest', 'en', "Order a pisco sour and decide for yourself where it was invented. Diplomatically.", None),
                ('comic', 'en', "Locals call Lima's grey sky 'panza de burro', donkey's belly. Poetic and accurate.", None),
                ('useful', 'tr', "Peru'da 'gracias' kadar 'por favor' da önemli; nazik bir 'por favor' kapıları açar.", None),
            ], notify=1),
    Capital(id='santiago', city='Santiago', country='CL', place='Paseo Ahumada', anchor=(-33.44020, -70.65120), coord='approx',
            layout=('line', 0, 60, -3), source=W + 'Paseo_Ahumada',
            ar="Paseo Ahumada: pedestrian since 1977–78, linking Plaza de Armas to the city's main avenue. On clear days the Andes watch from the east. / ¡Bienvenidos!",
            notes=[
                ('comic', 'en', "Chileans add 'po' to everything. 'Ya po' means… it depends.", None),
                ('useful', 'en', "Clear days after rain give the best Andes views.", None),
                ('useful', 'en', "Plaza de Armas at the north end is the historic heart of the city.", MAIN),
                ('aesthetic', 'en', "At sunset the mountains turn pink. Look east.", None),
                ('quest', 'en', "Try a completo: a hot dog with avocado and much more. A full meal in one hand.", None),
                ('comic', 'en', "Street vendors here sell everything, including things you didn't know were for sale.", None),
                ('useful', 'tr', "Şili'de akşam çayına 'once' denir; adı on bir demek ama saat akşamdır.", None),
            ], notify=2),
    Capital(id='ottawa', city='Ottawa', country='CA', place='ByWard Market', anchor=(45.4271, -75.6923), coord='wikipedia',
            layout=('ring', 40), source=W + 'ByWard_Market',
            ar="The ByWard Market is named after the old 'By Ward', for engineer John By. Market by day, buzz by night. / Bienvenue!",
            notes=[
                ('comic', 'en', "Ottawa winters are serious. Locals call -15°C 'brisk'.", None),
                ('useful', 'en', "The market buildings are open all year; outdoor stalls appear when the weather allows.", MAIN),
                ('useful', 'en', "Parliament Hill is a short walk away.", None),
                ('aesthetic', 'en', "In winter the lights over the market streets make the snow glow.", None),
                ('quest', 'en', "Try a maple treat. Consider it a local culture test.", None),
                ('comic', 'en', "Winter dressing tip: layers like an onion. Summer: peel them off like a happier onion.", None),
                ('useful', 'tr', "Kanada'da tabelalar iki dilli, İngilizce ve Fransızca. Ottawa'da ikisini de duyarsın.", None),
            ], notify=1),
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


def build():
    items, problems = [], []
    for capital in CAPITALS:
        spots = positions(capital.anchor, capital.layout)
        problems += capital_problems(capital, spots)
        items += capital_items(capital, spots)
    problems += [problem for item in items for problem in item_problems(item)]
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
