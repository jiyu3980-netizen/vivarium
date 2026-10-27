# 파일명 기반 분류 규칙: (정규식, 한국어 대표명, 대분류, 소분류, 태그, 신뢰도)  — 위에서부터 먼저 일치하는 규칙 사용
# 이름 앞부분(규칙 일치 이전의 단어)은 ADJ 사전으로 번역하고 모르는 단어(브랜드 등)는 영문 그대로 둔다.
R=[
(r'vulcan','Vulcan VC4GD 컨벡션 오븐!','kitchen','oven',['오븐','컨벡션','주방','Vulcan'],'high'),
# --- 침대 ---
(r'hair dryer(?: holder)?','헤어드라이어','bathroom','bathroom-accessory',['욕실'],'medium'),
(r'bunk bed','2층 침대','furniture','bed',['침대','어린이'],'high'),(r'trundle bed','트런들 침대','furniture','bed',['침대'],'high'),
(r'double twin beds','트윈 침대','furniture','bed',['침대'],'high'),(r'baby bed','아기 침대','furniture','bed',['침대','아기'],'high'),
(r'(messy )?bed cover','침대 커버','decor','ornament',['침구'],'medium'),(r'messy bed','흐트러진 침대','furniture','bed',['침대'],'high'),(r'\bbed\b','침대','furniture','bed',['침대'],'high'),
(r'pillow','베개','decor','ornament',['침구'],'high'),(r'folded blanket','접힌 담요','decor','ornament',['침구'],'high'),(r'blanket','담요','decor','ornament',['침구'],'high'),
(r'hammock chair','해먹 의자','furniture','chair',['해먹','야외'],'high'),(r'hammock','해먹','furniture','bed',['해먹','야외'],'high'),
# --- 소파/의자 ---
(r'corner sofa','코너 소파','furniture','sofa',['소파'],'high'),(r'sofa set','소파 세트','furniture','sofa',['소파'],'high'),(r'sofa','소파','furniture','sofa',['소파'],'high'),
(r'peeps soft seating','소프트 시팅','furniture','sofa',['소파','좌석'],'medium'),(r'bean bag','빈백','furniture','sofa',['빈백'],'high'),
(r'puff chair','푸프 의자','furniture','chair',['의자'],'high'),(r'reading chair with table','독서 의자와 테이블','furniture','chair',['의자','테이블'],'high'),
(r'reading chairs','독서 의자','furniture','chair',['의자'],'high'),(r'reading area','독서 공간','furniture','chair',['의자','독서'],'medium'),
(r'(rocking|easy|swivel|bar|high back|armchair|outdoor armchair|collapsable|ladderback( wooden)?|farmhouse|bamboo cane|papa bear|aeron|hepplewhite|plastic|rattan|stool)\b.*(chair|stool)|chairs?\b|armchair|stool','의자','furniture','chair',['의자'],'high'),
(r'balcony chairs','발코니 의자','furniture','chair',['의자','발코니'],'high'),
# --- 책상/테이블 ---
(r'drafting table','제도 테이블','furniture','desk',['책상'],'high'),(r'desk','책상','furniture','desk',['책상'],'high'),(r'workstation computer','컴퓨터 워크스테이션','furniture','desk',['책상','컴퓨터'],'high'),
(r'office cubicle','사무실 큐비클','furniture','desk',['사무실','책상'],'high'),(r'boss table','서재 테이블!','furniture','desk',['책상','사무실'],'medium'),
(r'dressing table','화장대','furniture','cabinet',['화장대'],'high'),
(r'japanese low table','일본식 좌식 테이블','furniture','dining-table',['테이블','좌식'],'high'),(r'(breakfast|dining|round dining) table|4 seater','식탁','furniture','dining-table',['식탁'],'high'),
(r'mahjong table','마작 테이블','furniture','dining-table',['테이블','게임'],'high'),(r'chess table','체스 테이블','furniture','dining-table',['테이블','체스'],'high'),
(r'folding card table|folding table','접이식 테이블','furniture','dining-table',['테이블','접이식'],'high'),
(r'trolley table|ball transfer table','트롤리 테이블','furniture','side-table-bench',['테이블','카트'],'medium'),
(r'console table','콘솔 테이블','furniture','side-table-bench',['테이블'],'high'),(r'coffee table','커피 테이블','furniture','side-table-bench',['테이블'],'high'),
(r'vintage table|\btable\b','테이블','furniture','side-table-bench',['테이블'],'medium'),
# --- 수납 ---
(r'tv stands?|entertainment centers?','TV 장식장','furniture','cabinet',['TV','수납'],'high'),(r'trophy cabinet|display cabinet|wine cabinet|filing cabinet|crockery unit|sideboard|dresser|linen closet|closet clothes|gym lockers|cabinet','수납장','furniture','cabinet',['수납'],'high'),
(r'bookcase|bookshelf|bookshelves|book display|old book shelf|library','책장','storage-lifestyle','shelf',['책장'],'high'),(r'floating shelves|dress shelf|shelf','선반','storage-lifestyle','shelf',['선반'],'high'),
(r'old steamer trunk','오래된 트렁크','furniture','cabinet',['수납','트렁크'],'high'),
(r'pull out basket|wire basket|laundry basket|vegetable basket|fruit basket|basket','바구니','storage-lifestyle','waste-bin',['바구니'],'medium'),
(r'wheelie bin','대형 쓰레기통','storage-lifestyle','waste-bin',['쓰레기통'],'high'),(r'bin\b','쓰레기통','storage-lifestyle','waste-bin',['쓰레기통'],'medium'),
(r'cardboard box|gift box|first aid box|\bbox\b','상자','other','miscellaneous-household-items',['상자'],'medium'),
(r'clothing rack|clothes on hanger|hanging clothes|trouser hanger|hanger','옷걸이','storage-lifestyle','clothes-hanger',['옷걸이','의류'],'high'),
(r'mirror','거울','storage-lifestyle','mirror',['거울'],'high'),
# --- 벽난로 ---
(r'fireplace log holder|fireplace wood logs','벽난로 장작','furniture','fireplace',['벽난로','장작'],'high'),(r'fireplaces?','벽난로','furniture','fireplace',['벽난로'],'high'),(r'wood burning stove','장작 난로','furniture','fireplace',['난로'],'high'),
# --- 조명 ---
(r'chandeliers?','샹들리에','lighting','ceiling-light',['조명','샹들리에'],'high'),(r'ceiling fan','실링팬','appliances','air-conditioner',['선풍기','천장'],'high'),
(r'pendant (heating )?lamp|suspension lamp|ceiling lamp|bulb lights|spiral light bulb|rattan lamp|bamboo lamp|rattan pendant lamp|lamp1','펜던트 조명','lighting','ceiling-light',['조명','천장'],'high'),
(r'floor lamp','스탠드 조명','lighting','floor-lamp',['조명','스탠드'],'high'),(r'sconce|wall light|carriage light|barn light','벽 조명','lighting','wall-light',['조명','벽등'],'high'),
(r'table lamp|candlestick lamp|revolve table lamp','테이블 램프','lighting','table-lamp',['조명','램프'],'high'),(r'mason jar light','메이슨 자 조명','lighting','ceiling-light',['조명'],'medium'),
(r'chinese lanterns|japanese lanterns|lantern','랜턴','decor','ornament',['등','랜턴'],'high'),(r'diya|oil lamps','오일 램프','decor','ornament',['램프'],'high'),(r'candles?','양초','decor','ornament',['양초'],'high'),
# --- 주방/가전 ---
(r'kitchen base cabinet','주방 하부장','kitchen','countertop',['주방','수납'],'high'),(r'kitchen island','주방 아일랜드','kitchen','countertop',['주방'],'high'),
(r'l shaped kitchens|kitchenette|entire kitchen|outdoor kitchens|office pantry|restaurant food service|mini bar','주방 유닛','kitchen','countertop',['주방'],'high'),
(r'farmers sink|farmhouse sink|kitchen sink|corner sink|lab sink|pedicure sink|laundry sink','싱크대','kitchen','kitchen-sink',['싱크'],'high'),
(r'(range|oven|stove|cooker|hobs|cooktop)','레인지·오븐','kitchen','oven',['조리','오븐'],'high'),(r'microwave','전자레인지 후드','kitchen','oven',['전자레인지'],'high'),
(r'waffle iron|toaster|blender|mixer|juicer|grinder|coffee drip|coffee maker|french press|rice cooker|sewing machine','소형 가전','appliances','small-appliance',['소형가전'],'high'),
(r'kettle','주전자','kitchen','cookware-food',['주전자'],'high'),(r'frying pan|kitchen pots|pots|pan\b|kitchen utensils','조리도구','kitchen','cookware-food',['조리도구'],'high'),
(r'dish rack|dishes and cutlery|stacked plates|tea set|coffee cup|coffee paper cup|wine glass|cup\b|plates?','식기','kitchen','tableware',['식기'],'high'),
(r'fridge|freezer','냉장고','kitchen','refrigerator',['냉장고'],'high'),
(r'washing machine|washer|dryer|duet','세탁기','appliances','washing-machine',['세탁'],'high'),(r'laundry area','세탁 공간','appliances','washing-machine',['세탁'],'medium'),
(r'\btv\b|lg tv|old tv','TV','appliances','television',['TV'],'high'),
(r'split ac|outdoor unit|daikin','에어컨 실외기','appliances','air-conditioner',['에어컨'],'high'),(r'(table |box )?fan\b','선풍기','appliances','air-conditioner',['선풍기'],'high'),
(r'water heater|boiler|furnace','보일러·온수기','appliances','heater',['보일러'],'high'),(r'water dispenser','정수기','appliances','small-appliance',['정수기'],'high'),
# --- 욕실 ---
(r'bidet|wc\b|toilet\b','변기','bathroom','toilet',['변기'],'high'),(r'toilet paper holder','휴지걸이','bathroom','towel-holder',['욕실'],'high'),
(r'tub\b|clawfoot','욕조','bathroom','bathtub',['욕조'],'high'),(r'plunge','냉탕 욕조','bathroom','bathtub',['욕조'],'medium'),
(r'shower','샤워부스','bathroom','shower-enclosure',['샤워'],'high'),(r'vanity|wash basin|circular sink|sink','세면대','bathroom','bathroom-sink',['세면대'],'high'),
(r'towels?','수건','bathroom','towel-holder',['수건'],'high'),(r'soap ?dish|hand sanitizer|bath','욕실 소품','bathroom','bathroom-accessory',['욕실'],'medium'),
# --- 문/창 ---
(r'garage door|barn door|dutch door|sliding door|bi ?fold(ing)? (closet )?door|bifold folding doors|fluted glass door|spanish doors|automatic door|\bdoors?\b','문','architectural-elements','door',['문'],'high'),
(r'windows?','창문','architectural-elements','window',['창문'],'high'),(r'collapsible gate|wood arbor with gate|gate','문(게이트)','architectural-elements','door',['게이트'],'medium'),
(r'staircase|stairs','계단','architectural-elements','staircase',['계단'],'high'),(r'balusters|columns|railing','건축 부재','architectural-elements','built-in-structure',['건축'],'medium'),
(r'partition|screen\b','파티션','architectural-elements','partition',['파티션'],'high'),(r'blinds?|curtain|mosquito net','블라인드·커튼','decor','ornament',['창가'],'high'),
# --- 식물 ---
(r'planter|flower box|clay pots|hanging planter|water pot|water jar|water jars?','화분·플랜터','plants','planter',['화분'],'medium'),
(r'plant|palm|fern|croton|orchid|aloe|corn plant|money plant|jade|tree|vines?|grapevine|trellis|rosa|heliconia|cattail|radish|rice plant|philodendron|calathea|bird of paradise|bottle palm|fiddle leaf','식물','plants','indoor-plant',['식물'],'high'),
(r'vegetable garden|vegetables|garden','정원·채소','plants','outdoor-garden',['정원'],'medium'),
# --- 야외/구조물 ---
(r'pergola|arbor|tent camping|log store shed|bird bath|splash pad|mailbox|water well|water buckets|hydro ?rail|exterior|front porch','야외 시설','plants','outdoor-garden',['야외'],'medium'),
# --- 전자/취미 ---
(r'playstation|xbox|dj setup|gramophone|record player|radio|headphone|planetarium projector|projector','AV·게임기기','electronics','gaming-av',['오디오','게임'],'high'),
(r'network|cctv|intercom|workstation|tv aerial|notebook|disc filter|metering unit|electrical wall outlet|outlet','IT·설비','electronics','it-network',['설비'],'medium'),
(r'camera','카메라','electronics','camera',['카메라'],'high'),(r'telephone|phone','전화기','other','telephone-audio',['전화기'],'high'),
(r'piano|violin|guitar','악기','hobby','music-instrument',['악기'],'high'),(r'easel|art supplies|chemistry|beaker|globe','미술·실험 용품','hobby','art-craft',['미술','교구'],'medium'),
(r'chess|board game','체스','hobby','game-table',['게임'],'high'),(r'krishna|statue|katana|deer head|picture frame','장식 소품','decor','ornament',['장식'],'high'),(r'clock','시계','decor','clock',['시계'],'high'),
# --- 음식/동물/의류/차량 ---
(r'cupcakes?|cake|champagne|oil bottles|bottle|whisky|whiskey|barrel|condiments|fruit bowl|fruit|jars|ice bucket|water bottle','음식·음료','food-drink','food',['음식'],'medium'),
(r'cat\b|dog|chicken|rottweiler|teddy bear','동물·인형','animals','pet-animal',['동물'],'high'),
(r'shoes?|jacket|clothes|bag\b|school bag|folded clothes','의류·잡화','clothing','clothes',['의류'],'high'),(r'makeup|cosmetics|beauty|detergent','생활 소모품','other','miscellaneous-household-items',['생활용품'],'medium'),
(r'peugeot|motorhome|car\b','차량','vehicle','vehicle',['차량'],'high'),(r'ladders?','사다리','other','miscellaneous-household-items',['사다리'],'high'),
(r'prayer unit','기도 공간','furniture','cabinet',['기도'],'medium'),(r'flexible duct|fuel container|grinding stone|boiler room|hydro','설비·기타','other','miscellaneous-household-items',['설비'],'low'),
]
ADJ={'modern':'모던','vintage':'빈티지','old':'오래된','classic':'클래식','traditional':'전통','victorian style':'빅토리아풍','japanese':'일본식','chinese':'중국식','king size':'킹사이즈','queen upholstered':'퀸 패브릭','upholstered':'패브릭','queen':'퀸','minimalist':'미니멀','industrial':'산업풍','baroque':'바로크','gothic':'고딕','long crystal':'롱 크리스탈','rattan':'라탄','outdoor':'야외','commercial':'상업용','corner':'코너','free standing':'독립형','freestanding':'독립형','double':'더블','single':'싱글','hanging':'걸이식','folding':'접이식','foldable':'접이식','wall hung':'벽걸이','round':'원형','oval':'타원형','circular':'원형','upright':'업라이트','electric':'전기','detailed':'정교한','children s':'어린이','childrens':'어린이','wooden':'목재','wood':'원목','glass':'유리','stainless':'스테인리스','small':'소형','large':'대형','french':'프랑스식','georgian':'조지안','gas':'가스','accessible':'접근성 설계','farmhouse':'팜하우스','sliding':'슬라이딩','bay':'베이','arch top':'아치형','church':'교회','mini':'미니','pull out':'인출식','top load':'상부 투입','stacked':'적층','3 modern':'3구 모던','30 inch':'30인치','30':'30인치','42 inches':'42인치','24 inch':'24인치','4 burner':'4구','4 tier':'4단','4 seater':'4인용','6 x 6':'6x6','2 panel':'2패널','5':'5','1':'1'}

PRE=[
(r'bird bath','버드배스(새 물놀이대)!','plants','outdoor-garden',['정원','야외'],'high'),
(r'tv aerial','TV 안테나!','electronics','it-network',['TV','안테나'],'high'),
(r'dishwasher','식기세척기','appliances','small-appliance',['식기세척기'],'high'),
(r'rice cooker','밥솥','appliances','small-appliance',['밥솥'],'high'),(r'sewing machine','재봉틀','appliances','small-appliance',['재봉틀'],'high'),
(r'toaster','토스터','appliances','small-appliance',['토스터'],'high'),(r'blender','블렌더','appliances','small-appliance',['블렌더'],'high'),(r'\bmixer','믹서','appliances','small-appliance',['믹서'],'high'),
(r'juicer','착즙기','appliances','small-appliance',['착즙기'],'high'),(r'coffee grinder','커피 그라인더!','appliances','small-appliance',['커피'],'high'),
(r'coffee drip','커피 드립 브루어!','appliances','small-appliance',['커피'],'high'),(r'(traditional )?coffee maker','커피메이커','appliances','small-appliance',['커피'],'high'),
(r'french press','프렌치 프레스 커피메이커!','appliances','small-appliance',['커피'],'high'),(r'waffle iron','와플 메이커!','appliances','small-appliance',['와플'],'high'),
(r'kitchen base cabinet','주방 하부장','kitchen','countertop',['주방','수납'],'high'),(r'wall oven','월 오븐 수납장','kitchen','oven',['오븐'],'high'),
(r'fan palm','부채야자!','plants','indoor-plant',['식물'],'high'),(r'toilet paper holder','휴지걸이','bathroom','towel-holder',['욕실'],'high'),
(r'ventilation window','환기창','architectural-elements','window',['창문','욕실'],'high'),
(r'screen planter','스크린 플랜터!','plants','planter',['화분','파티션'],'medium'),(r'planter box','플랜터 박스','plants','planter',['화분'],'high'),(r'flower box','화분 상자(플라워박스)!','plants','planter',['화분'],'high'),
(r'clay pots','토분!','plants','planter',['화분'],'high'),(r'hanging planter','걸이식 화분!','plants','planter',['화분'],'high'),
(r'cosmetics bottles','화장품 용기!','other','miscellaneous-household-items',['화장품'],'medium'),
(r'table lamp','테이블 램프','lighting','table-lamp',['조명','램프'],'high'),(r'table fan|box fan','선풍기','appliances','air-conditioner',['선풍기'],'high'),
(r'dumbbell rack','덤벨 랙','other','miscellaneous-household-items',['운동','랙'],'medium'),(r'book stack','책 더미!','decor','ornament',['책'],'medium'),(r'aquarium','수족관!','decor','ornament',['수족관'],'medium'),
(r'breakfast tray','아침 식사 트레이!','kitchen','tableware',['트레이'],'medium'),(r'luggage trolley cart','짐 카트!','other','miscellaneous-household-items',['카트'],'medium'),
(r'mobile computer cart','이동식 컴퓨터 카트!','electronics','it-network',['카트','컴퓨터'],'medium'),(r'pen holder','펜 꽂이!','decor','ornament',['문구'],'medium'),
(r'coffee cup with saucer','커피잔과 받침!','kitchen','tableware',['식기'],'high'),(r'wine glass and bottle','와인잔과 병!','kitchen','tableware',['식기'],'high'),
(r'aloe vera','알로에 베라!','plants','indoor-plant',['식물'],'high'),(r'bird of paradise','극락조!','plants','indoor-plant',['식물'],'high'),(r'bottle palm','보틀야자!','plants','indoor-plant',['식물'],'high'),
(r'calathea lutea','칼라테아 루테아!','plants','indoor-plant',['식물'],'high'),(r'calathea zebrina','칼라테아 제브리나!','plants','indoor-plant',['식물'],'high'),(r'cattail','부들!','plants','indoor-plant',['식물'],'high'),
(r'fiddle leaf fig','피들리프 무화과나무!','plants','indoor-plant',['식물'],'high'),(r'jade plant','제이드 플랜트!','plants','indoor-plant',['식물'],'high'),(r'lemon tree','레몬나무!','plants','indoor-plant',['식물'],'high'),
(r'potted fern','고사리 화분!','plants','indoor-plant',['식물','화분'],'high'),(r'potted money plant','머니 플랜트 화분!','plants','indoor-plant',['식물','화분'],'high'),(r'philodendron','필로덴드론!','plants','indoor-plant',['식물'],'high'),
(r'garden radish','무 (텃밭)!','plants','outdoor-garden',['채소','텃밭'],'high'),(r'rice plant','벼!','plants','outdoor-garden',['작물'],'high'),(r'climbing plants','덩굴식물!','plants','indoor-plant',['식물'],'high'),(r'hanging vines','늘어진 덩굴!','plants','indoor-plant',['식물'],'high'),
(r'corn plant','콘 플랜트!','plants','indoor-plant',['식물'],'high'),(r'rosa plant','장미!','plants','indoor-plant',['식물'],'high'),(r'heliconia','헬리코니아!','plants','indoor-plant',['식물'],'high'),(r'croton','크로톤!','plants','indoor-plant',['식물'],'high'),(r'orchid','난초!','plants','indoor-plant',['식물'],'high'),(r'grapevine','포도덩굴!','plants','indoor-plant',['식물'],'high'),(r'trellis','트렐리스(격자 구조)!','plants','outdoor-garden',['정원'],'high'),
]
R=PRE+R
TOK={'with':'+','and':'+','in':'','of':'','plant':'','plants':'','tree':'나무','tropical':'열대','potted':'화분','ceiling':'천장','light':'조명','hood':'후드','slide':'슬라이드인','dish':'식기','seat':'시트','paper':'종이','holder':'홀더','stand':'스탠드','fixture':'기구','rack':'랙','bottle':'병','kit':'키트','products':'용품','s':'','pad':'패드','water':'물','curtain':'커튼','guardian':'수호','dog':'개','sleeping':'잠자는','spiral':'나선형','grand':'그랜드','front':'전면','porch':'포치','railing':'난간','wall':'벽','room':'룸','installation':'설치','area':'공간','bbq':'바비큐','bathroom':'욕실','tumble':'텀블','dryer':'건조기','unit':'유닛','video':'비디오','recorder':'레코더','switch':'스위치','monitor':'모니터','cart':'카트','residential':'주거용','domestic':'가정용','exterior':'외부','hot':'온수','cold':'냉수','half':'하프','pedestal':'페디스털','vessel':'볼','tankless':'탱크리스','balcony':'발코니','paper shopping':'종이 쇼핑','shopping':'쇼핑','bag':'가방','top view':'(평면도)','view':'뷰','mens':'남성용','sport':'스포츠','book':'책','birthday':'생일','kitchen':'주방','decorations':'장식','condiments':'양념','candle':'양초','lantern':'랜턴','oil':'오일','lamps':'램프','grandfather':'','cooker':'쿠커','range':'레인지','arm':'암','blue':'블루','black':'블랙','white':'화이트','red':'레드','built in':'빌트인','built':'빌트인','walk in':'워크인','tub':'욕조','wash':'세면','basin':'볼','sash':'새시','king':'킹','piece':'피스','one':'원','concrete':'콘크리트','laundry':'세탁','mobile':'이동식','pantry':'팬트리','school':'학교','luggage':'짐','trolley':'트롤리','stove':'스토브','gas':'가스','electric':'전기','cooktop':'쿡탑','hobs':'가스레인지','contemporary':'컨템포러리','steel':'스틸','speed':'스피드','delicate':''}
ADJ.update(TOK)

PRE2=[
(r'record player','레코드 플레이어!','electronics','gaming-av',['오디오'],'high'),(r'gramophone','축음기!','electronics','gaming-av',['오디오'],'high'),(r'^radio$','라디오!','electronics','gaming-av',['오디오'],'high'),
(r'dj setup','DJ 세팅!','electronics','gaming-av',['오디오'],'high'),(r'headphone','헤드폰 + 스탠드!','electronics','gaming-av',['오디오'],'high'),(r'playstation 5','PlayStation 5!','electronics','gaming-av',['게임기'],'high'),(r'xbox 360','Xbox 360!','electronics','gaming-av',['게임기'],'high'),
(r'planetarium projector','천체 투영기(플라네타리움)!','electronics','gaming-av',['투영기'],'high'),(r'^notebook$','노트북!','electronics','it-network',['컴퓨터'],'medium'),(r'^intercom$','인터폰!','electronics','it-network',['설비'],'high'),
(r'network rack','네트워크 랙!','electronics','it-network',['설비'],'high'),(r'network switch','네트워크 스위치!','electronics','it-network',['설비'],'high'),(r'network video recorder','네트워크 비디오 레코더(NVR)!','electronics','it-network',['설비'],'high'),
(r'cctv monitor','CCTV 모니터!','electronics','it-network',['설비'],'high'),(r'disc filter','디스크 필터!','electronics','it-network',['설비'],'medium'),(r'quad electrical wall outlet','4구 벽 콘센트!','electronics','it-network',['콘센트'],'high'),(r'water metering unit','수도 계량기 유닛!','electronics','it-network',['설비'],'medium'),
(r'^lg tv$','LG TV!','appliances','television',['TV'],'high'),(r'^old tv$','구형 TV!','appliances','television',['TV'],'high'),(r'dslr camera','DSLR 카메라!','electronics','camera',['카메라'],'high'),
(r'deer head','사슴 머리 박제 장식!','decor','ornament',['장식'],'high'),(r'katana','카타나(일본도)!','decor','ornament',['장식'],'high'),(r'krishna statue','크리슈나 상!','decor','ornament',['조각상'],'high'),(r'earth globe','지구본!','hobby','art-craft',['지구본'],'high'),
(r'chemistry equipment','화학 실험 기구!','hobby','art-craft',['실험'],'high'),(r'^beaker$','비커!','hobby','art-craft',['실험'],'high'),(r'artist easel|easel stand','이젤!','hobby','art-craft',['미술'],'high'),(r'art supplies','미술 용품!','hobby','art-craft',['미술'],'high'),
(r'upright piano','업라이트 피아노!','hobby','music-instrument',['악기'],'high'),(r'^violin$','바이올린!','hobby','music-instrument',['악기'],'high'),(r'electric guitar','일렉트릭 기타 + 스탠드!','hobby','music-instrument',['악기'],'high'),
(r'^cupcakes$','컵케이크!','food-drink','food',['음식'],'high'),(r'birthday cake','생일 케이크!','food-drink','food',['음식'],'high'),(r'^cake$','케이크!','food-drink','food',['음식'],'high'),(r'^champagne$','샴페인!','food-drink','food',['음료'],'high'),
(r'whisk(e)?y bottle','위스키 병!','food-drink','food',['음료'],'high'),(r'whiskey barrel','위스키 배럴!','food-drink','food',['음료','통'],'high'),(r'oil barrel','오일 배럴!','other','miscellaneous-household-items',['통'],'medium'),(r'oil bottles','오일 병!','food-drink','food',['병'],'high'),
(r'fruit bowl','과일 그릇!','kitchen','tableware',['과일'],'high'),(r'ice bucket','아이스 버킷!','kitchen','tableware',['음료'],'high'),(r'hermetic jars','밀폐 용기!','kitchen','cookware-food',['용기'],'high'),(r'water bottle','물병!','kitchen','tableware',['물병'],'high'),
(r'kitchen decorations condiments','주방 장식·양념 용기!','kitchen','tableware',['주방'],'medium'),(r'school bag','책가방!','clothing','clothes',['가방'],'high'),(r'paper shopping bag','종이 쇼핑백!','clothing','clothes',['가방'],'high'),(r'mens shoes','남성 신발!','clothing','clothes',['신발'],'high'),(r'sport shoe','운동화!','clothing','clothes',['신발'],'high'),
(r'makeup kit','메이크업 키트!','other','miscellaneous-household-items',['화장품'],'high'),(r'beauty products','뷰티 제품!','other','miscellaneous-household-items',['화장품'],'high'),(r'detergent products','세제 제품!','other','miscellaneous-household-items',['세제'],'high'),(r'laundry detergents','세탁 세제!','other','miscellaneous-household-items',['세제'],'high'),
(r'rottweiler','로트와일러 (경비견)!','animals','pet-animal',['개'],'high'),(r'dog sleeping','잠자는 개!','animals','pet-animal',['개'],'high'),(r'sleeping cat','잠자는 고양이!','animals','pet-animal',['고양이'],'high'),(r'^cat$','고양이!','animals','pet-animal',['고양이'],'high'),(r'^chicken$','닭!','animals','pet-animal',['닭'],'high'),(r'teddy bear','테디베어!','animals','pet-animal',['인형'],'high'),
(r'peugeot 207','푸조 207!','vehicle','vehicle',['차량'],'high'),(r'^motorhome$','캠핑카(모터홈)!','vehicle','vehicle',['차량'],'high'),
]
R=PRE2+R
TOK2={'board':'보드','floor':'플로어','dining':'','bookshelf':'','bidet':'비데','equipment':'장비','statue':'상','section':'단면','tables':'테이블','table':'테이블','library':'라이브러리','ladder':'사다리','washer':'세탁기','burner':'버너','boiler':'보일러','cabinet':'수납장','cooker':'쿠커','plunge':'플런지','freezer':'냉동고','kettle':'주전자','coffee':'커피','tea':'차','window':'창문','toilet':'변기','press':'프레스','christian':'기독교','glass':'유리','bin':'통','sofa':'소파','chair':'의자'}
ADJ.update(TOK2)
