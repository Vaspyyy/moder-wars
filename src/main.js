import JSZip from "jszip";

import L from "leaflet";
import { CONFIG } from "./config.js";
import { fetchJSONWithCache } from "./geo.js";

/**
 * TRANSLATION SYSTEM (i18n)
 */
export const TRANSLATIONS = {
	en: {
		MODERN_WARS: "Modern Wars",
		LANGUAGE: "Language",
		LANGUAGE_SUB: "System-wide display language.",
		MAP_RES: "Map Resolution",
		RES_LOW: "Low (Performance)",
		RES_STD: "Standard (Medium)",
		RES_HIGH: "High (Very Heavy)",
		RES_SUB: "Higher resolution improves borders but slows loading.",
		GRID_DENSITY: "Grid Density",
		GRID_FAST: "Low (Fast)",
		GRID_STD: "Standard",
		GRID_SMOOTH: "High (Smooth)",
		GRID_INSANE: "Insane (Ultra)",
		GRID_SUB: "Density affects the smoothness of frontlines.",
		MAX_UNITS: "Max Units (Global)",
		UNIT_MIN: "100 (Minimalist)",
		UNIT_STD: "250 (Standard)",
		UNIT_WAR: "500 (Grand War)",
		UNIT_STRESS: "1000 (Maximum Stress)",
		UNIT_SUB: "Reduces unit count for cleaner fronts and better performance.",
		BG_VOLUME: "Background Music Volume",
		BG_SUB: "Adjusts the volume of the background music.",
		DISABLE_MT_SUB:
			"Removes terrain-based movement penalties and visual darkening.",
		DISABLE_PROV_SUB:
			"Removes the visual internal province subdivisions within countries.",
		HIDE_UNITS: "Hide Units Visually",
		HIDE_UNITS_SUB:
			"Disables rendering of unit icons and flags for a significant FPS boost.",
		SAVE_SKIP: "Remember & Skip on Startup",
		APPLY_INIT: "Apply & Initialize",
		OPERATIONS: "Operations",
		CONQUEST: "CONQUEST",
		CONQUEST_SUB: "Global Warfare",
		EDITOR: "EDITOR",
		EDITOR_SUB: "World Builder",
		INTELLIGENCE: "Intelligence",
		HUB: "EDITOR HUB",
		HUB_SUB: "Community Content",
		LOAD_FILE: "LOAD FILE",
		LOAD_FILE_SUB: "Import Preset",
		SYSTEM: "System",
		ENGINE: "ENGINE",
		ENGINE_SUB: "Fidelity & FPS",
		TUTORIAL: "TUTORIAL",
		TUTORIAL_SUB: "Learn the Ropes",
		SERVER: "SERVER",
		SERVER_SUB: "Join Discord",
		CREDITS: "CREDITS",
		CREDITS_SUB: "Contributors",
		DONATE: "DONATE",
		DONATE_SUB: "Support the dev",
		PC_REQD:
			"System Requirement: High-performance PC recommended. Mobile and low-end hardware may experience significant simulation lag.",
		STABLE: "CONNECTION STABLE",
		LOADING: "Loading...",
		GOD_MODE: "GOD MODE",
		GOD_ACTIVE: "GOD ACTIVE",
		SIM_PAUSED: "SIMULATION PAUSED",
		SELECT_P1: "Select First Country",
		SELECT_P2: "Select Enemy Country",
		CONFLICT_SETUP: "Conflict Setup",
		CHOOSE_ERA: "CHOOSE ERA",
		MODERN_DAY: "2022",
		MODERN_DAY_SUB: "Present Geopolitics (Real Earth)",
		WW2_SCENARIO: "1936 SCENARIO",
		WW2_SCENARIO_SUB: "WW2 Strategic Theater",
		BACK_TO_MENU: "BACK TO MENU",
		RANDOM_WAR_OFF: "Random War: OFF",
		RANDOM_WAR_ON: "Random War: ON",
		ADD_SIDE: "+ Side",
		FFA: "FFA",
		SETUP_PROMPT:
			"Select a side, then click countries on the map to recruit them.",
		STRATEGY: "Attack Strategy",
		STRAT_ALL: "All Fronts (Global)",
		STRAT_FOCUS: "Targeted Strike (Localized)",
		DENSITY: "Force Density",
		FIGHT_TO_DEATH: "FIGHT TO THE DEATH (NO PEACE)",
		DISABLE_MISSILES: "DISABLE LONG-RANGE MISSILES",
		DISABLE_MT: "DISABLE MOUNTAINS",
		DISABLE_PROV: "DISABLE PROVINCES",
		DISABLE_PUPPETS: "DISABLE PUPPETS (NO VASSAL CALL)",
		INAUGURATE: "Inaugurate Conflict",
		REBELLION: "Start Rebellion",
		POLITICAL: "POLITICAL",
		ARROWS: "ARROWS (BUGGY)",
		BATTLE_VIS: "BATTLE VISUALS",
		GOD: "GOD",
		DIPLOMACY: "DIPLOMACY",
		RESTART: "RESTART",
		UNITS: "UNITS",
		VS_MINI: "vs",
		EDITOR_TOOLS: "EDITOR TOOLS",
		NEW_NATION: "New Nation",
		TEST_SCENARIO: "Test Scenario",
		UPDATE_SCENARIO: "Update Scenario",
		SAVE_PRESET: "Save Preset",
		LOAD_PRESET: "Load Preset",
		SHARE_HUB: "Share to Hub",
		HUB_TAB: "Editor Hub",
		COUNTRY_LIB: "Country Library",
		FLAG_LIB: "Flag Library",
		SAVE_COUNTRY: "Save Country",
		LOAD_COUNTRY: "Load Country",
		PAINT: "Paint",
		FILL: "Fill",
		UNCLAIM: "Unclaim",
		EXIT_EDITOR: "Exit Editor",
		NATIONS: {
			Germany: "Germany",
			"German Reich": "German Reich",
			Poland: "Poland",
			Russia: "Russia",
			"United States": "United States",
			France: "France",
			"United Kingdom": "United Kingdom",
			Italy: "Italy",
			China: "China",
			Japan: "Japan",
			"Soviet Union": "Soviet Union",
			Turkey: "Turkey",
			Ukraine: "Ukraine",
			Belarus: "Belarus",
			Brazil: "Brazil",
			Canada: "Canada",
			Australia: "Australia",
			India: "India",
			Spain: "Spain",
			Mexico: "Mexico",
			"South Korea": "South Korea",
			"North Korea": "North Korea",
			Vietnam: "Vietnam",
		},
	},
	ru: {
		MODERN_WARS: "Современные Войны",
		LANGUAGE: "Язык",
		LANGUAGE_SUB: "Язык отображения системы.",
		MAP_RES: "Разрешение карты",
		RES_LOW: "Низкое (Скорость)",
		RES_STD: "Стандарт (Среднее)",
		RES_HIGH: "Высокое (Тяжелое)",
		RES_SUB: "Высокое разрешение улучшает границы, но замедляет загрузку.",
		GRID_DENSITY: "Плотность сетки",
		GRID_FAST: "Низкая (Быстро)",
		GRID_STD: "Стандарт",
		GRID_SMOOTH: "Высокая (Плавно)",
		GRID_SUB: "Плотность влияет на плавность линий фронта.",
		MAX_UNITS: "Макс. юнитов",
		UNIT_MIN: "100 (Минимум)",
		UNIT_STD: "250 (Стандарт)",
		UNIT_WAR: "500 (Большая война)",
		UNIT_STRESS: "1000 (Стресс-тест)",
		UNIT_SUB: "Уменьшает количество юнитов для производительности.",
		BG_VOLUME: "Громкость музыки",
		BG_SUB: "Регулировка громкости фоновой музыки.",
		DISABLE_MT_SUB: "Удаляет штрафы за передвижение по пересеченной местности.",
		DISABLE_PROV_SUB: "Удаляет внутренние границы внутри стран.",
		HIDE_UNITS: "Скрыть юнитов",
		HIDE_UNITS_SUB: "Отключает отрисовку иконок юнитов для повышения FPS.",
		SAVE_SKIP: "Запомнить и пропускать при запуске",
		APPLY_INIT: "Применить и Запустить",
		OPERATIONS: "Операции",
		CONQUEST: "ЗАВОЕВАНИЕ",
		CONQUEST_SUB: "Глобальная война",
		EDITOR: "РЕДАКТОР",
		EDITOR_SUB: "Конструктор мира",
		INTELLIGENCE: "Разведка",
		HUB: "ХАБ РЕДАКТОРА",
		HUB_SUB: "Контент сообщества",
		LOAD_FILE: "ЗАГРУЗИТЬ",
		LOAD_FILE_SUB: "Импорт сценария",
		SYSTEM: "Система",
		ENGINE: "ДВИЖОК",
		ENGINE_SUB: "Качество и FPS",
		TUTORIAL: "ОБУЧЕНИЕ",
		TUTORIAL_SUB: "Изучить основы",
		SERVER: "СЕРВЕР",
		SERVER_SUB: "Discord",
		CREDITS: "АВТОРЫ",
		CREDITS_SUB: "Контрибьюторы",
		DONATE: "ПОДДЕРЖКА",
		DONATE_SUB: "Поддержать разработку",
		PC_REQD:
			"Требования: Рекомендуется мощный ПК. На мобильных устройствах возможны лаги.",
		STABLE: "СОЕДИНЕНИЕ СТАБИЛЬНО",
		LOADING: "Загрузка...",
		GOD_MODE: "РЕЖИМ БОГА",
		GOD_ACTIVE: "БОГ АКТИВЕН",
		SIM_PAUSED: "СИМУЛЯЦИЯ ПРИОСТАНОВЛЕНА",
		SELECT_P1: "Выберите первую страну",
		SELECT_P2: "Выберите противника",
		CONFLICT_SETUP: "Настройка конфликта",
		CHOOSE_ERA: "ВЫБЕРИТЕ ЭПОХУ",
		MODERN_DAY: "НАШИ ДНИ",
		MODERN_DAY_SUB: "Современная геополитика",
		WW2_SCENARIO: "СЦЕНАРИЙ 1936",
		WW2_SCENARIO_SUB: "Театр Второй мировой войны",
		BACK_TO_MENU: "В МЕНЮ",
		RANDOM_WAR_OFF: "Случ. война: ВЫКЛ",
		RANDOM_WAR_ON: "Случ. война: ВКЛ",
		ADD_SIDE: "+ Сторона",
		FFA: "Каждый сам за себя",
		SETUP_PROMPT: "Выберите сторону, затем нажимайте на страны на карте.",
		STRATEGY: "Стратегия атаки",
		STRAT_ALL: "Все фронты (Глобально)",
		STRAT_FOCUS: "Точечный удар (Локально)",
		DENSITY: "Плотность войск",
		FIGHT_TO_DEATH: "ВОЙНА ДО КОНЦА (БЕЗ МИРА)",
		DISABLE_MISSILES: "ОТКЛЮЧИТЬ РАКЕТЫ",
		DISABLE_MT: "БЕЗ ГОР",
		DISABLE_PROV: "БЕЗ ПРОВИНЦИЙ",
		DISABLE_PUPPETS: "БЕЗ ВАССАЛОВ",
		INAUGURATE: "Начать конфликт",
		REBELLION: "Восстание",
		POLITICAL: "ПОЛИТИЧЕСКАЯ",
		ARROWS: "СТРЕЛКИ",
		BATTLE_VIS: "БОИ",
		GOD: "БОГ",
		DIPLOMACY: "ДИПЛОМАТИЯ",
		RESTART: "ПЕРЕЗАПУСК",
		UNITS: "ЮНИТЫ",
		VS_MINI: "против",
		EDITOR_TOOLS: "ИНСТРУМЕНТЫ",
		NEW_NATION: "Новая нация",
		TEST_SCENARIO: "Тест",
		UPDATE_SCENARIO: "Обновить",
		SAVE_PRESET: "Сохранить",
		LOAD_PRESET: "Загрузить",
		SHARE_HUB: "В Хаб",
		HUB_TAB: "Хаб",
		COUNTRY_LIB: "Библиотека стран",
		FLAG_LIB: "Флаги",
		SAVE_COUNTRY: "Сохр. страну",
		LOAD_COUNTRY: "Загр. страну",
		PAINT: "Кисть",
		FILL: "Заливка",
		UNCLAIM: "Стереть",
		EXIT_EDITOR: "Выход",
		NATIONS: {
			Germany: "Германия",
			"German Reich": "Германский Рейх",
			Poland: "Польша",
			Russia: "Россия",
			"United States": "США",
			France: "Франция",
			"United Kingdom": "Великобритания",
			Italy: "Италия",
			China: "Китай",
			Japan: "Япония",
			"United States of America": "США",
			"Soviet Union": "СССР",
			Turkey: "Турция",
			Ukraine: "Украина",
			Belarus: "Беларусь",
			Kazakhstan: "Казахстан",
			Brazil: "Бразилия",
			Canada: "Канада",
			Australia: "Австралия",
			India: "Индия",
			Spain: "Испания",
			Mexico: "Мексика",
			"South Korea": "Южная Корея",
			"North Korea": "Северная Корея",
			Vietnam: "Вьетнам",
		},
	},
	ja: {
		MODERN_WARS: "モダン・ウォーズ",
		LANGUAGE: "言語",
		LANGUAGE_SUB: "システム表示言語。",
		MAP_RES: "マップ解像度",
		RES_LOW: "低 (パフォーマンス)",
		RES_STD: "標準 (中)",
		RES_HIGH: "高 (非常に重い)",
		RES_SUB: "解像度が高いと境界線は綺麗になりますが、読み込みが遅くなります。",
		GRID_DENSITY: "グリッド密度",
		GRID_FAST: "低 (高速)",
		GRID_STD: "標準",
		GRID_SMOOTH: "高 (滑らか)",
		GRID_SUB: "密度は前線の滑らかさに影響します。",
		MAX_UNITS: "最大ユニット数",
		UNIT_MIN: "100 (最小限)",
		UNIT_STD: "250 (標準)",
		UNIT_WAR: "500 (大戦争)",
		UNIT_STRESS: "1000 (最大負荷)",
		UNIT_SUB: "ユニット数を減らすことで、パフォーマンスが向上します。",
		BG_VOLUME: "BGM 音量",
		BG_SUB: "背景音楽の音量を調整します。",
		DISABLE_MT_SUB: "地形による移動ペナルティと視覚的な暗転を除去します。",
		DISABLE_PROV_SUB: "国境内部の州の境界線を除去します。",
		HIDE_UNITS: "ユニットを非表示にする",
		HIDE_UNITS_SUB: "アイコンと旗の描画を停止し、FPSを大幅に向上させます。",
		SAVE_SKIP: "設定を保存して次回からスキップ",
		APPLY_INIT: "適用して初期化",
		OPERATIONS: "軍事作戦",
		CONQUEST: "征服モード",
		CONQUEST_SUB: "世界大戦シミュレーション",
		EDITOR: "エディター",
		EDITOR_SUB: "ワールドビルダー",
		INTELLIGENCE: "インテリジェンス",
		HUB: "エディターハブ",
		HUB_SUB: "コミュニティコンテンツ",
		LOAD_FILE: "ファイルを読み込む",
		LOAD_FILE_SUB: "プリセットをインポート",
		SYSTEM: "システム",
		ENGINE: "エンジン設定",
		ENGINE_SUB: "画質とFPS",
		TUTORIAL: "チュートリアル",
		TUTORIAL_SUB: "基本操作を学ぶ",
		SERVER: "サーバー",
		SERVER_SUB: "Discordに参加",
		CREDITS: "クレジット",
		CREDITS_SUB: "貢献者",
		DONATE: "寄付",
		DONATE_SUB: "開発者を支援",
		PC_REQD:
			"動作環境: 高性能なPCを推奨します。モバイルや低スペック端末では遅延が発生する場合があります。",
		STABLE: "接続安定",
		LOADING: "読み込み中...",
		GOD_MODE: "ゴッドモード",
		GOD_ACTIVE: "ゴッドモード有効",
		SIM_PAUSED: "シミュレーション停止中",
		SELECT_P1: "最初の国を選択",
		SELECT_P2: "敵対国を選択",
		CONFLICT_SETUP: "紛争セットアップ",
		CHOOSE_ERA: "時代を選択",
		MODERN_DAY: "2022",
		MODERN_DAY_SUB: "現在の地政学 (リアルアース)",
		WW2_SCENARIO: "1936年シナリオ",
		WW2_SCENARIO_SUB: "第二次世界大戦の戦略戦域",
		BACK_TO_MENU: "メニューに戻る",
		RANDOM_WAR_OFF: "ランダム戦争: オフ",
		RANDOM_WAR_ON: "ランダム戦争: オン",
		ADD_SIDE: "+ 陣営追加",
		FFA: "無差別戦 (FFA)",
		SETUP_PROMPT:
			"陣営を選択し、マップ上の国をクリックして参加させてください。",
		STRATEGY: "攻撃戦略",
		STRAT_ALL: "全前線 (グローバル)",
		STRAT_FOCUS: "重点攻撃 (局地戦)",
		DENSITY: "兵力密度",
		FIGHT_TO_DEATH: "死闘モード (講和なし)",
		DISABLE_MISSILES: "長距離ミサイル無効",
		DISABLE_MT: "山岳無効",
		DISABLE_PROV: "州の境界無効",
		DISABLE_PUPPETS: "傀儡国無効",
		INAUGURATE: "紛争開始",
		REBELLION: "反乱開始",
		POLITICAL: "政治地図",
		ARROWS: "進撃矢印",
		BATTLE_VIS: "戦闘エフェクト",
		GOD: "神",
		DIPLOMACY: "外交",
		RESTART: "再起動",
		UNITS: "部隊",
		VS_MINI: "対",
		EDITOR_TOOLS: "エディターツール",
		NEW_NATION: "新国家作成",
		TEST_SCENARIO: "シナリオテスト",
		UPDATE_SCENARIO: "シナリオ更新",
		SAVE_PRESET: "プリセット保存",
		LOAD_PRESET: "プリセット読込",
		SHARE_HUB: "ハブに共有",
		HUB_TAB: "ハブ",
		COUNTRY_LIB: "国家ライブラリ",
		FLAG_LIB: "国旗ライブラリ",
		SAVE_COUNTRY: "国家保存",
		LOAD_COUNTRY: "国家読込",
		PAINT: "ペイント",
		FILL: "塗りつぶし",
		UNCLAIM: "領土解除",
		EXIT_EDITOR: "終了",
		NATIONS: {
			Germany: "ドイツ",
			"German Reich": "ドイツ国",
			Poland: "ポーランド",
			Russia: "ロシア",
			"United States": "アメリカ",
			France: "フランス",
			"United Kingdom": "イギリス",
			Italy: "イタリア",
			China: "中国",
			Japan: "日本",
			"Soviet Union": "ソ連",
			Turkey: "トルコ",
			Ukraine: "ウクライナ",
			"South Korea": "韓国",
			"North Korea": "北朝鮮",
			Brazil: "ブラジル",
			Canada: "カナダ",
			Australia: "オーストラリア",
			India: "インド",
			Spain: "スペイン",
			Mexico: "メキシコ",
			Vietnam: "ベトナム",
		},
	},
	es: {
		MODERN_WARS: "Guerras Modernas",
		LANGUAGE: "Idioma",
		LANGUAGE_SUB: "Idioma de visualización del sistema.",
		MAP_RES: "Resolución del Mapa",
		RES_LOW: "Baja (Rendimiento)",
		RES_STD: "Estándar (Media)",
		RES_HIGH: "Alta (Pesada)",
		RES_SUB: "Mayor resolución mejora bordes pero ralentiza carga.",
		GRID_DENSITY: "Densidad de Cuadrícula",
		GRID_FAST: "Baja (Rápida)",
		GRID_STD: "Estándar",
		GRID_SMOOTH: "Alta (Suave)",
		GRID_SUB: "La densidad afecta la suavidad de los frentes.",
		MAX_UNITS: "Unidades Máximas",
		UNIT_MIN: "100 (Mínimo)",
		UNIT_STD: "250 (Estándar)",
		UNIT_WAR: "500 (Guerra)",
		UNIT_STRESS: "1000 (Estrés Máximo)",
		UNIT_SUB: "Mejora el rendimiento con menos unidades.",
		BG_VOLUME: "Volumen Música",
		BG_SUB: "Ajusta el volumen de la música de fondo.",
		DISABLE_MT_SUB:
			"Elimina penalizaciones de terreno y oscurecimiento visual.",
		DISABLE_PROV_SUB: "Elimina subdivisiones internas de los países.",
		HIDE_UNITS: "Ocultar Unidades",
		HIDE_UNITS_SUB: "Desactiva iconos de unidades para ganar FPS.",
		SAVE_SKIP: "Recordar y Omitir al Inicio",
		APPLY_INIT: "Aplicar e Inicializar",
		OPERATIONS: "Operaciones",
		CONQUEST: "CONQUISTA",
		CONQUEST_SUB: "Guerra Global",
		EDITOR: "EDITOR",
		EDITOR_SUB: "Constructor",
		INTELLIGENCE: "Inteligencia",
		HUB: "CENTRO EDITOR",
		HUB_SUB: "Contenido Comunitario",
		LOAD_FILE: "CARGAR ARCHIVO",
		LOAD_FILE_SUB: "Importar Escenario",
		SYSTEM: "Sistema",
		ENGINE: "MOTOR",
		ENGINE_SUB: "Fidelidad y FPS",
		TUTORIAL: "TUTORIAL",
		TUTORIAL_SUB: "Aprende las Reglas",
		SERVER: "SERVIDOR",
		SERVER_SUB: "Unirse a Discord",
		CREDITS: "CRÉDITOS",
		CREDITS_SUB: "Colaboradores",
		DONATE: "DONAR",
		DONATE_SUB: "Apoya al dev",
		PC_REQD:
			"Requisito: Se recomienda PC de alto rendimiento. Hardware de gama baja puede sufrir lag.",
		STABLE: "CONEXIÓN ESTABLE",
		LOADING: "Cargando...",
		GOD_MODE: "MODO DIOS",
		GOD_ACTIVE: "DIOS ACTIVO",
		SELECT_P1: "Seleccionar primer país",
		SELECT_P2: "Seleccionar enemigo",
		CONFLICT_SETUP: "Configuración del conflicto",
		RANDOM_WAR_OFF: "Guerra aleat: OFF",
		RANDOM_WAR_ON: "Guerra aleat: ON",
		ADD_SIDE: "+ Lado",
		FFA: "FFA",
		SETUP_PROMPT: "Selecciona un bando, luego haz clic en los países del mapa.",
		STRATEGY: "Estrategia de ataque",
		STRAT_ALL: "Todos los frentes",
		STRAT_FOCUS: "Ataque focalizado",
		DENSITY: "Densidad de fuerza",
		FIGHT_TO_DEATH: "LUCHA HASTA LA MUERTE (SIN PAZ)",
		DISABLE_MISSILES: "DESACTIVAR MISILES",
		DISABLE_MT: "DESACTIVAR MONTAÑAS",
		DISABLE_PROV: "DESACTIVAR PROVINCIAS",
		DISABLE_PUPPETS: "DESACTIVAR PUPPETS",
		INAUGURATE: "Inaugurar Conflicto",
		REBELLION: "Iniciar Rebelión",
		POLITICAL: "POLÍTICO",
		ARROWS: "FLECHAS",
		BATTLE_VIS: "VISUALES DE BATALLA",
		GOD: "DIOS",
		DIPLOMACY: "DIPLOMACIA",
		RESTART: "REINICIAR",
		UNITS: "UNIDADES",
		VS_MINI: "vs",
		EDITOR_TOOLS: "HERRAMIENTAS",
		NEW_NATION: "Nueva Nación",
		TEST_SCENARIO: "Probar Escenario",
		UPDATE_SCENARIO: "Actualizar",
		SAVE_PRESET: "Guardar Preset",
		LOAD_PRESET: "Cargar Preset",
		SHARE_HUB: "Compartir",
		HUB_TAB: "Hub",
		COUNTRY_LIB: "Biblioteca de Países",
		FLAG_LIB: "Biblioteca de Banderas",
		SAVE_COUNTRY: "Guardar País",
		LOAD_COUNTRY: "Cargar País",
		PAINT: "Pintar",
		FILL: "Llenar",
		UNCLAIM: "Desreclamar",
		EXIT_EDITOR: "Salir",
		NATIONS: {
			Germany: "Alemania",
			"German Reich": "Reich Alemán",
			Poland: "Polonia",
			Russia: "Rusia",
			"United States": "Estados Unidos",
			France: "Francia",
			"United Kingdom": "Reino Unido",
			Italy: "Italia",
			China: "China",
			Japan: "Japón",
			"Soviet Union": "Unión Soviética",
			Turkey: "Turquía",
			Ukraine: "Ucrania",
			Brazil: "Brasil",
			Canada: "Canadá",
			Australia: "Australia",
			India: "India",
			Spain: "España",
			Mexico: "México",
			"South Korea": "Corea del Sur",
			"North Korea": "Corea del Norte",
			Vietnam: "Vietnam",
		},
	},
	fr: {
		MODERN_WARS: "Guerres Modernes",
		LANGUAGE: "Langue",
		LANGUAGE_SUB: "Langue d'affichage du système.",
		MAP_RES: "Résolution Carte",
		RES_LOW: "Basse (Performance)",
		RES_STD: "Standard (Moyenne)",
		RES_HIGH: "Haute (Lourde)",
		RES_SUB: "Améliore les bordures mais ralentit le chargement.",
		GRID_DENSITY: "Densité Grille",
		GRID_FAST: "Basse (Rapide)",
		GRID_STD: "Standard",
		GRID_SMOOTH: "Haute (Lisse)",
		GRID_SUB: "La densité affecte la fluidité du front.",
		MAX_UNITS: "Unités Max",
		UNIT_MIN: "100 (Mini)",
		UNIT_STD: "250 (Standard)",
		UNIT_WAR: "500 (Guerre)",
		UNIT_STRESS: "1000 (Stress Max)",
		UNIT_SUB: "Réduit les unités pour booster les FPS.",
		BG_VOLUME: "Volume Musique",
		BG_SUB: "Ajuste le volume de fond.",
		DISABLE_MT: "Désactiver Montagnes",
		DISABLE_MT_SUB: "Supprime les malus de mouvement.",
		DISABLE_PROV: "Désactiver Provinces",
		DISABLE_PROV_SUB: "Supprime les subdivisions internes.",
		HIDE_UNITS: "Cacher Unités",
		HIDE_UNITS_SUB: "Désactive les icônes pour plus de FPS.",
		SAVE_SKIP: "Retenir et ignorer au démarrage",
		APPLY_INIT: "Appliquer et Lancer",
		OPERATIONS: "Opérations",
		CONQUEST: "CONQUÊTE",
		CONQUEST_SUB: "Guerre Globale",
		EDITOR: "ÉDITEUR",
		EDITOR_SUB: "Créateur de Monde",
		INTELLIGENCE: "Renseignement",
		HUB: "HUB ÉDITEUR",
		HUB_SUB: "Contenu Communautaire",
		LOAD_FILE: "CHARGER FICHIER",
		LOAD_FILE_SUB: "Importer Scénario",
		SYSTEM: "Système",
		ENGINE: "MOTEUR",
		ENGINE_SUB: "Fidélité & FPS",
		TUTORIAL: "TUTORIEL",
		TUTORIAL_SUB: "Apprendre les bases",
		SERVER: "SERVEUR",
		SERVER_SUB: "Rejoindre Discord",
		CREDITS: "CRÉDITS",
		CREDITS_SUB: "Contributeurs",
		DONATE: "DON",
		DONATE_SUB: "Soutenir le dev",
		PC_REQD: "Requis : PC puissant recommandé. Lag possible sur mobile.",
		STABLE: "CONNEXION STABLE",
		LOADING: "Chargement...",
		GOD_MODE: "MODE DIEU",
		GOD_ACTIVE: "DIEU ACTIF",
		SELECT_P1: "Choisir le premier pays",
		SELECT_P2: "Choisir l'ennemi",
		CONFLICT_SETUP: "Configuration du conflit",
		RANDOM_WAR_OFF: "Guerre aléat: OFF",
		RANDOM_WAR_ON: "Guerre aléat: ON",
		ADD_SIDE: "+ Camp",
		FFA: "FFA",
		SETUP_PROMPT: "Choisissez un camp, puis cliquez sur les pays.",
		STRATEGY: "Stratégie d'attaque",
		STRAT_ALL: "Tous les fronts",
		STRAT_FOCUS: "Frappe ciblée",
		DENSITY: "Densité de force",
		FIGHT_TO_DEATH: "GUERRE À MORT (PAS DE PAIX)",
		DISABLE_MISSILES: "DÉSACTIVER MISSILES",
		INAUGURATE: "Inaugurer le Conflit",
		REBELLION: "Lancer Rébellion",
		POLITICAL: "POLITIQUE",
		ARROWS: "FLÈCHES",
		BATTLE_VIS: "VISUELS COMBAT",
		GOD: "DIEU",
		DIPLOMACY: "DIPLOMATIE",
		RESTART: "REDÉMARRER",
		UNITS: "UNITÉS",
		VS_MINI: "vs",
		EDITOR_TOOLS: "OUTILS",
		NEW_NATION: "Nouvelle Nation",
		TEST_SCENARIO: "Tester",
		UPDATE_SCENARIO: "Mettre à jour",
		SAVE_PRESET: "Sauvegarder",
		LOAD_PRESET: "Charger",
		SHARE_HUB: "Partager",
		HUB_TAB: "Hub",
		COUNTRY_LIB: "Bibliothèque Pays",
		FLAG_LIB: "Drapeaux",
		SAVE_COUNTRY: "Sauver Pays",
		LOAD_COUNTRY: "Charger Pays",
		PAINT: "Peindre",
		FILL: "Remplir",
		UNCLAIM: "Libérer",
		EXIT_EDITOR: "Quitter",
		NATIONS: {
			Germany: "Allemagne",
			"German Reich": "Reich Allemand",
			Poland: "Pologne",
			Russia: "Russie",
			"United States": "États-Unis",
			France: "France",
			"United Kingdom": "Royaume-Uni",
			Italy: "Italie",
			China: "Chine",
			Japan: "Japon",
			"Soviet Union": "Union Soviétique",
			Turkey: "Turquie",
			Ukraine: "Ukraine",
			Brazil: "Brésil",
			Canada: "Canada",
			Australia: "Australie",
			India: "Inde",
			Spain: "Espagne",
			Mexico: "Mexique",
			"South Korea": "Corée du Sud",
			"North Korea": "Corée du Nord",
			Vietnam: "Vietnam",
		},
	},
	de: {
		MODERN_WARS: "Moderne Kriege",
		LANGUAGE: "Sprache",
		LANGUAGE_SUB: "System-Sprache.",
		MAP_RES: "Kartenauflösung",
		RES_LOW: "Niedrig (Leistung)",
		RES_STD: "Standard (Mittel)",
		RES_HIGH: "Hoch (Schwer)",
		RES_SUB: "Verbessert Grenzen, verzögert Laden.",
		GRID_DENSITY: "Gitterdichte",
		GRID_FAST: "Niedrig (Schnell)",
		GRID_STD: "Standard",
		GRID_SMOOTH: "Hoch (Glatt)",
		GRID_SUB: "Beeinflusst Frontverlauf.",
		MAX_UNITS: "Einheitenlimit",
		UNIT_MIN: "100 (Min)",
		UNIT_STD: "250 (Standard)",
		UNIT_WAR: "500 (Krieg)",
		UNIT_STRESS: "1000 (Stress)",
		UNIT_SUB: "Wenig Einheiten für hohe FPS.",
		BG_VOLUME: "Musiklautstärke",
		BG_SUB: "Hintergrundmusik anpassen.",
		DISABLE_MT: "Berge deaktivieren",
		DISABLE_MT_SUB: "Entfernt Geländestrafen.",
		DISABLE_PROV: "Provinzen aus",
		DISABLE_PROV_SUB: "Entfernt interne Grenzen.",
		HIDE_UNITS: "Einheiten verbergen",
		HIDE_UNITS_SUB: "Deaktiviert Icons für FPS-Boost.",
		SAVE_SKIP: "Einstellungen speichern & überspringen",
		APPLY_INIT: "Anwenden & Starten",
		OPERATIONS: "Operationen",
		CONQUEST: "EROBERUNG",
		CONQUEST_SUB: "Globaler Krieg",
		EDITOR: "EDITOR",
		EDITOR_SUB: "Weltenbauer",
		INTELLIGENCE: "Geheimdienst",
		HUB: "EDITOR HUB",
		HUB_SUB: "Community-Inhalte",
		LOAD_FILE: "DATEI LADEN",
		LOAD_FILE_SUB: "Preset importieren",
		SYSTEM: "System",
		ENGINE: "ENGINE",
		ENGINE_SUB: "Fidelität & FPS",
		TUTORIAL: "TUTORIAL",
		TUTORIAL_SUB: "Grundlagen lernen",
		SERVER: "SERVER",
		SERVER_SUB: "Discord beitreten",
		CREDITS: "CREDITS",
		CREDITS_SUB: "Mitwirkende",
		DONATE: "SPENDEN",
		DONATE_SUB: "Unterstütze den Dev",
		PC_REQD:
			"Anforderung: Leistungsstarker PC empfohlen. Lag auf Mobilgeräten möglich.",
		STABLE: "VERBINDUNG STABIL",
		LOADING: "Laden...",
		GOD_MODE: "GOTT-MODUS",
		GOD_ACTIVE: "GOTT AKTIV",
		SELECT_P1: "Erstes Land wählen",
		SELECT_P2: "Feind wählen",
		CONFLICT_SETUP: "Konflikt-Setup",
		RANDOM_WAR_OFF: "Zufallskrieg: AUS",
		RANDOM_WAR_ON: "Zufallskrieg: AN",
		ADD_SIDE: "+ Seite",
		FFA: "FFA",
		SETUP_PROMPT: "Seite wählen, dann Länder auf Karte anklicken.",
		STRATEGY: "Strategie",
		STRAT_ALL: "Alle Fronten",
		STRAT_FOCUS: "Gezielter Schlag",
		DENSITY: "Truppendichte",
		FIGHT_TO_DEATH: "KAMPF BIS ZUM TOD (KEIN FRIEDEN)",
		DISABLE_MISSILES: "RAKETEN DEAKTIVIEREN",
		INAUGURATE: "Konflikt eröffnen",
		REBELLION: "Rebellion starten",
		POLITICAL: "POLITISCH",
		ARROWS: "PFEILE",
		BATTLE_VIS: "KAMPFEFFEKTE",
		GOD: "GOTT",
		DIPLOMACY: "DIPLOMATIE",
		RESTART: "NEUSTART",
		UNITS: "EINHEITEN",
		VS_MINI: "vs",
		EDITOR_TOOLS: "TOOLS",
		NEW_NATION: "Neue Nation",
		TEST_SCENARIO: "Testen",
		UPDATE_SCENARIO: "Update",
		SAVE_PRESET: "Speichern",
		LOAD_PRESET: "Laden",
		SHARE_HUB: "Teilen",
		HUB_TAB: "Hub",
		COUNTRY_LIB: "Länderbibliothek",
		FLAG_LIB: "Flaggen",
		SAVE_COUNTRY: "Land speichern",
		LOAD_COUNTRY: "Land laden",
		PAINT: "Malen",
		FILL: "Füllen",
		UNCLAIM: "Freigeben",
		EXIT_EDITOR: "Beenden",
		NATIONS: {
			Germany: "Deutschland",
			"German Reich": "Deutsches Reich",
			Poland: "Polen",
			Russia: "Russland",
			"United States": "USA",
			France: "Frankreich",
			"United Kingdom": "Großbritannien",
			Italy: "Italien",
			China: "China",
			Japan: "Japan",
			"Soviet Union": "Sowjetunion",
			Turkey: "Türkei",
			Ukraine: "Ukraine",
			Brazil: "Brasilien",
			Canada: "Kanada",
			Australia: "Australien",
			India: "Indien",
			Spain: "Spanien",
			Mexico: "Mexiko",
			"South Korea": "Südkorea",
			"North Korea": "Nordkorea",
			Vietnam: "Vietnam",
		},
	},
	pt: {
		MODERN_WARS: "Guerras Modernas",
		LANGUAGE: "Idioma",
		LANGUAGE_SUB: "Idioma de exibição do sistema.",
		MAP_RES: "Resolução do Mapa",
		RES_LOW: "Baixa (Performance)",
		RES_STD: "Padrão (Média)",
		RES_HIGH: "Alta (Pesada)",
		RES_SUB: "Melhora bordas, mas retarda o carregamento.",
		GRID_DENSITY: "Densidade da Grade",
		GRID_FAST: "Baixa (Rápida)",
		GRID_STD: "Padrão",
		GRID_SMOOTH: "Alta (Suave)",
		GRID_SUB: "Afeta a suavidade das linhas de frente.",
		MAX_UNITS: "Limite de Unidades",
		UNIT_MIN: "100 (Mínimo)",
		UNIT_STD: "250 (Padrão)",
		UNIT_WAR: "500 (Guerra)",
		UNIT_STRESS: "1000 (Stress)",
		UNIT_SUB: "Reduz unidades para melhor FPS.",
		BG_VOLUME: "Volume da Música",
		BG_SUB: "Ajusta o volume da música.",
		DISABLE_MT: "Desativar Montanhas",
		DISABLE_MT_SUB: "Remove penalidades de movimento.",
		DISABLE_PROV: "Desativar Províncias",
		DISABLE_PROV_SUB: "Remove divisões internas.",
		HIDE_UNITS: "Ocultar Unidades",
		HIDE_UNITS_SUB: "Desativa ícones para ganho de FPS.",
		SAVE_SKIP: "Salvar e Ignorar no Início",
		APPLY_INIT: "Aplicar e Iniciar",
		OPERATIONS: "Operações",
		CONQUEST: "CONQUISTA",
		CONQUEST_SUB: "Guerra Global",
		EDITOR: "EDITOR",
		EDITOR_SUB: "Construtor de Mundo",
		INTELLIGENCE: "Inteligência",
		HUB: "HUB DO EDITOR",
		HUB_SUB: "Conteúdo da Comunidade",
		LOAD_FILE: "CARREGAR ARQUIVO",
		LOAD_FILE_SUB: "Importar Preset",
		SYSTEM: "Sistema",
		ENGINE: "MOTOR",
		ENGINE_SUB: "Fidelidade e FPS",
		TUTORIAL: "TUTORIAL",
		TUTORIAL_SUB: "Aprenda o básico",
		SERVER: "SERVIDOR",
		SERVER_SUB: "Entrar no Discord",
		CREDITS: "CRÉDITOS",
		CREDITS_SUB: "Contribuidores",
		DONATE: "DOAR",
		DONATE_SUB: "Apoie o dev",
		PC_REQD: "Requisito: Recomenda-se PC potente. Possível lag em mobile.",
		STABLE: "CONEXÃO ESTÁVEL",
		LOADING: "Carregando...",
		GOD_MODE: "MODO DEUS",
		GOD_ACTIVE: "DEUS ATIVO",
		SELECT_P1: "Escolha o primeiro país",
		SELECT_P2: "Escolha o inimigo",
		CONFLICT_SETUP: "Configuração do Conflito",
		RANDOM_WAR_OFF: "Guerra Aleat: OFF",
		RANDOM_WAR_ON: "Guerra Aleat: ON",
		ADD_SIDE: "+ Lado",
		FFA: "FFA",
		SETUP_PROMPT: "Escolha um lado e clique nos países do mapa.",
		STRATEGY: "Estratégia de Ataque",
		STRAT_ALL: "Todas as frentes",
		STRAT_FOCUS: "Ataque focado",
		DENSITY: "Densidade de Força",
		FIGHT_TO_DEATH: "LUTA ATÉ A MORTE (SEM PAZ)",
		DISABLE_MISSILES: "DESATIVAR MÍSSEIS",
		INAUGURATE: "Inaugurar Conflito",
		REBELLION: "Iniciar Rebelião",
		POLITICAL: "POLÍTICO",
		ARROWS: "SETAS",
		BATTLE_VIS: "VISUAIS DE BATALHA",
		GOD: "DEUS",
		DIPLOMACY: "DIPLOMACIA",
		RESTART: "REINICIAR",
		UNITS: "UNIDADES",
		VS_MINI: "vs",
		EDITOR_TOOLS: "FERRAMENTAS",
		NEW_NATION: "Nova Nação",
		TEST_SCENARIO: "Testar",
		UPDATE_SCENARIO: "Atualizar",
		SAVE_PRESET: "Salvar Preset",
		LOAD_PRESET: "Carregar Preset",
		SHARE_HUB: "Compartilhar",
		HUB_TAB: "Hub",
		COUNTRY_LIB: "Biblioteca",
		FLAG_LIB: "Bandeiras",
		SAVE_COUNTRY: "Salvar País",
		LOAD_COUNTRY: "Carregar País",
		PAINT: "Pintar",
		FILL: "Preencher",
		UNCLAIM: "Desreclamar",
		EXIT_EDITOR: "Sair",
		NATIONS: {
			Germany: "Alemanha",
			"German Reich": "Reich Alemão",
			Poland: "Polônia",
			Russia: "Rússia",
			"United States": "EUA",
			France: "França",
			"United Kingdom": "Reino Unido",
			Italy: "Itália",
			China: "China",
			Japan: "Japão",
			"Soviet Union": "União Soviética",
			Turkey: "Turquia",
			Ukraine: "Ucrânia",
			Brazil: "Brasil",
			Canada: "Canadá",
			Australia: "Austrália",
			India: "Índia",
			Spain: "Espanha",
			Mexico: "México",
			"South Korea": "Coreia do Sul",
			"North Korea": "Coreia do Norte",
			Vietnam: "Vietnã",
		},
	},
	it: {
		MODERN_WARS: "Guerre Moderne",
		LANGUAGE: "Lingua",
		LANGUAGE_SUB: "Lingua di sistema.",
		MAP_RES: "Risoluzione Mappa",
		RES_LOW: "Bassa",
		RES_STD: "Standard",
		RES_HIGH: "Alta",
		OPERATIONS: "Operazioni",
		CONQUEST: "CONQUISTA",
		EDITOR: "EDITOR",
		NATIONS: {
			Germany: "Germania",
			Poland: "Polonia",
			Russia: "Russia",
			"United States": "Stati Uniti",
			France: "Francia",
			Italy: "Italia",
		},
	},
	pl: {
		MODERN_WARS: "Wojny Współczesne",
		LANGUAGE: "Język",
		LANGUAGE_SUB: "Język systemu.",
		OPERATIONS: "Operacje",
		CONQUEST: "PODBÓJ",
		EDITOR: "EDYTOR",
		NATIONS: {
			Germany: "Niemcy",
			"German Reich": "III Rzesza",
			Poland: "Polska",
			Russia: "Rosja",
			"United States": "USA",
			France: "Francja",
		},
	},
	zh: {
		MODERN_WARS: "现代战争",
		LANGUAGE: "语言",
		LANGUAGE_SUB: "系统显示语言。",
		OPERATIONS: "军事行动",
		CONQUEST: "征服模式",
		EDITOR: "编辑器",
		NATIONS: {
			Germany: "德国",
			Poland: "波兰",
			Russia: "俄罗斯",
			"United States": "美国",
			France: "法国",
			China: "中国",
			Japan: "日本",
		},
	},
	uk: {
		MODERN_WARS: "Сучасні Війни",
		LANGUAGE: "Мова",
		LANGUAGE_SUB: "Мова системи.",
		OPERATIONS: "Операції",
		CONQUEST: "ЗАВОЮВАННЯ",
		EDITOR: "РЕДАКТОР",
		NATIONS: {
			Germany: "Німеччина",
			Poland: "Польща",
			Russia: "Росія",
			Ukraine: "Україна",
			"United States": "США",
		},
	},
	hi: {
		MODERN_WARS: "आधुनिक युद्ध",
		LANGUAGE: "भाषा",
		LANGUAGE_SUB: "सिस्टम की भाषा।",
		OPERATIONS: "संचालन",
		CONQUEST: "विजय",
		EDITOR: "संपादक",
		NATIONS: {
			Germany: "जर्मनी",
			Poland: "पोलैंड",
			Russia: "रूस",
			"United States": "अमेरिका",
			India: "भारत",
		},
	},
	ar: {
		MODERN_WARS: "الحروب الحديثة",
		LANGUAGE: "اللغة",
		LANGUAGE_SUB: "لغة عرض النظام.",
		OPERATIONS: "العمليات",
		CONQUEST: "غزو",
		EDITOR: "المحرر",
		NATIONS: {
			Germany: "ألمانيا",
			Poland: "بولندا",
			Russia: "روسيا",
			"United States": "الولايات المتحدة",
			Egypt: "مصر",
			"Saudi Arabia": "السعودية",
		},
	},
};

export function applyLanguage(lang) {
	if (!lang) lang = getCookie("mw_lang") || "en";
	const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const key = el.getAttribute("data-i18n");
		if (dict[key]) {
			el.innerText = dict[key];
		}
	});

	// Update dynamic status messages if they are currently set to default strings
	if (statusText) {
		const currentText = statusText.innerText;

		// Handle complex status strings like "REMIXING: World"
		if (currentText.includes(": ")) {
			const parts = currentText.split(": ");
			const prefixKey =
				parts[0] === "REMIXING"
					? "REMIXING"
					: parts[0] === "PLAYING"
						? "PLAYING"
						: null;
			if (prefixKey && dict[prefixKey]) {
				statusText.innerText = `${dict[prefixKey]}: ${parts[1]}`;
			}
		} else {
			for (const [key, val] of Object.entries(TRANSLATIONS.en)) {
				if (currentText === val && dict[key]) {
					statusText.innerText = dict[key];
					break;
				}
			}
		}
	}

	const select = document.getElementById("language-select");
	if (select) select.value = lang;
	setCookie("mw_lang", lang);

	// Re-translate country metadata
	if (countryMetadata) {
		countryMetadata.forEach((m) => {
			if (m?.name) {
				const trans = getTranslation(m.name, lang, "NATIONS");
				if (trans !== m.name) m.displayName = trans;
				else m.displayName = m.name;
			}
		});
	}

	// Re-translate current simulation side UI
	updateSidesUI();
}

export function getTranslation(
	key,
	lang = getCookie("mw_lang") || "en",
	subDict = null,
) {
	const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
	if (subDict && dict[subDict]) {
		return dict[subDict][key] || key;
	}
	return dict[key] || key;
}

document.getElementById("language-select")?.addEventListener("change", (e) => {
	applyLanguage(e.target.value);
});

/**
 * HELPERS
 */
export function setCookie(name, value, days = 365) {
	const expires = new Date(Date.now() + days * 864e5).toUTCString();
	// biome-ignore lint/suspicious/noDocumentCookie: cookie helper function
	document.cookie =
		name +
		"=" +
		encodeURIComponent(value) +
		"; expires=" +
		expires +
		"; path=/";
}

export function getCookie(name) {
	return document.cookie.split("; ").reduce((r, v) => {
		const parts = v.split("=");
		return parts[0] === name ? decodeURIComponent(parts[1]) : r;
	}, "");
}

export function parseColorToRGBA(c) {
	if (!c) return [150, 150, 150, 1.0];
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = c;
	ctx.fillRect(0, 0, 1, 1);
	const data = ctx.getImageData(0, 0, 1, 1).data;
	// data is [R, G, B, A] where A is 0-255
	return [data[0], data[1], data[2], data[3] / 255];
}

/**
 * Updates a country's flag across all data structures and UI components.
 */

export function getFlagUrl(code, name) {
	if (!code || code === "-99") {
		code = findCodeByName(name);
	}
	if (!code || code === "-99") return null;
	return `https://flagcdn.com/w320/${code.toLowerCase()}.webp`;
}

// biome-ignore lint/complexity/useRegexLiterals: regex literal contains )$ which confuses some parsers
export const rgbaRe = new RegExp("[\\d.]+\\)$", "g");

/**
 * Ensure we have a drawable flag image object for a country metadata entry.
 * This prefers any existing tempFlag, otherwise tries to load from flagUrl.
 */
export function ensureFlagImage(meta) {
	return new Promise((resolve) => {
		if (!meta) return resolve(null);

		// If we already have a canvas or image ready, use it
		if (
			meta.tempFlag &&
			(meta.tempFlag.complete === undefined || meta.tempFlag.complete)
		) {
			return resolve(meta.tempFlag);
		}

		if (!meta.flagUrl) return resolve(null);

		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			meta.tempFlag = img;
			resolve(img);
		};
		img.onerror = () => resolve(null);
		img.src = meta.flagUrl;
	});
}

/**
 * Generate a dynamic puppet flag: left half = puppet, right half = overlord.
 * This is only used for vassalages created after the game has started.
 */
export async function generatePuppetFlag(puppetId, overlordId) {
	if (!puppetId || !overlordId) return;
	const puppetMeta = countryMetadata.find((m) => m && m.id === puppetId);
	const overlordMeta = countryMetadata.find((m) => m && m.id === overlordId);
	if (!puppetMeta || !overlordMeta) return;

	const puppetImg = await ensureFlagImage(puppetMeta);
	const overlordImg = await ensureFlagImage(overlordMeta);
	if (!puppetImg || !overlordImg) return;

	// Create composite canvas
	const width = 160;
	const height = 100;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");

	// Base background
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, width, height);

	// Draw puppet flag covering the whole flag area
	ctx.drawImage(
		puppetImg,
		0,
		0,
		puppetImg.naturalWidth || puppetImg.width,
		puppetImg.naturalHeight || puppetImg.height,
		0,
		0,
		width,
		height,
	);

	// Draw overlord flag as a canton in the top‑left corner
	const cantonWidth = Math.floor(width * 0.35);
	const cantonHeight = Math.floor(height * 0.45);

	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, cantonWidth, cantonHeight);
	ctx.clip();

	ctx.drawImage(
		overlordImg,
		0,
		0,
		overlordImg.naturalWidth || overlordImg.width,
		overlordImg.naturalHeight || overlordImg.height,
		0,
		0,
		cantonWidth,
		cantonHeight,
	);
	ctx.restore();

	// Border around the canton
	ctx.strokeStyle = "rgba(0,0,0,0.85)";
	ctx.lineWidth = 2;
	ctx.strokeRect(0.5, 0.5, cantonWidth - 1, cantonHeight - 1);

	// Slight border around whole flag
	ctx.strokeStyle = "rgba(0,0,0,0.7)";
	ctx.lineWidth = 2;
	ctx.strokeRect(0, 0, width, height);

	// Use the canvas as the in‑memory flag immediately so units render correctly
	puppetMeta.tempFlag = canvas;
	sides.flat().forEach((c) => {
		if (c && c.id === puppetId) {
			c.flag = canvas;
		}
	});

	// Export as a data:image URL so all UI elements can use it without uploading
	try {
		const dataUrl = canvas.toDataURL("image/png");
		updateCountryFlag(puppetId, dataUrl);
	} catch (e) {
		console.warn("Failed to generate data URL for puppet flag", e);
	}

	// Force a re-render so the new flag is visible on map and in UI
	if (influenceLayer) influenceLayer.render();
}

export const explosionUrl = "assets/audio/explosion-pas-61639.mp3";
export const clickUrl = "assets/audio/low-button-click-331780.mp3";

// Background music playlist: Replaced with MW ST folder assets
export const bgMusicUrls = [
	"/mw st/mw new ost/Stormfront.m4a",
	"/mw st/mw new ost/All This.m4a",
	"/mw st/mw new ost/Movement Proposition - Kevin MacLeod (Audio).m4a",
	"/mw st/mw new ost/Hitman.m4a",
	"/mw st/mw new ost/Satiate.m4a",
	"/mw st/mw new ost/Industrial Revolution - Kevin MacLeod.m4a",
	"/mw st/mw new ost/Red Alert 3 Theme - Soviet March.m4a",
	"/mw st/mw new ost/Марк Бернес ＂Темная ночь＂ (1943).m4a",
	"/mw st/mw new ost/Failing Defense.m4a",
	"/mw st/mw new ost/Kevin MacLeod [Official] - Killers - incompetech.com.m4a",
];

export const warStartUrl = "assets/audio/war.wav";
export const peaceUrl = "assets/audio/peace.wav";
export const warAmbianceUrl = "assets/audio/modern-war-129016.mp3";

// Initialize Audio Context immediately so it's ready for early decoding
export const audioCtx = new (
	window.AudioContext || window.webkitAudioContext
)();
export let explosionBuffer = null;
export let clickBuffer = null;
// Background music buffers keyed by URL
export const bgMusicBuffers = {};
export let isAudioLoading = false;
export let warStartBuffer = null;
export let peaceBuffer = null;
export let warAmbianceBuffer = null;
export let bgMusicSource = null;
export let bgMusicGain = null;
// Track index currently playing from bgMusicUrls
export let currentBgTrackIndex = null;
export let customTrackUrl = getCookie("mw_custom_track") || null;
export let warAmbianceSource = null;
export let warAmbianceGain = null;

/**
 * High-priority loader for small UI elements.
 * This runs as soon as the script executes to minimize interaction latency.
 */
export const loadImmediate = async (url) => {
	try {
		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();
		return await audioCtx.decodeAudioData(arrayBuffer);
	} catch (e) {
		console.warn(`Audio Error (Immediate): Failed to load ${url}`, e);
		return null;
	}
};

// Start loading the click sound instantly
loadImmediate(clickUrl).then((buffer) => {
	if (buffer) clickBuffer = buffer;
});

export async function initAudio() {
	// Resume context if suspended (common browser policy on first click)
	if (audioCtx.state === "suspended") {
		try {
			await audioCtx.resume();
		} catch (_e) {}
	}

	if (isAudioLoading) return;

	const needsMusic = !bgMusicSource;
	const needsBuffers =
		!explosionBuffer ||
		!clickBuffer ||
		!warStartBuffer ||
		!peaceBuffer ||
		!warAmbianceBuffer;

	if (!needsMusic && !needsBuffers) return;

	isAudioLoading = true;

	const load = async (url) => {
		try {
			// Encode URI to handle spaces and non-ASCII characters in asset paths
			const response = await fetch(encodeURI(url));
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const arrayBuffer = await response.arrayBuffer();
			return await new Promise((resolve, reject) => {
				audioCtx.decodeAudioData(arrayBuffer, resolve, (err) => {
					console.warn(`Decoding failure for ${url}:`, err);
					reject(err);
				});
			});
		} catch (e) {
			console.warn(`Audio Force-Load Error: Failed for ${url}`, e);
			return null;
		}
	};

	// Helper to start playing a specific background track index
	const playBackgroundTrack = async (index) => {
		// Force resume on every track change attempt to stay ahead of browser suspension
		if (audioCtx.state === "suspended") {
			try {
				await audioCtx.resume();
			} catch (_e) {}
		}

		let url;
		if (customTrackUrl) {
			url = customTrackUrl;
		} else {
			if (index == null || index < 0 || index >= bgMusicUrls.length) {
				index = Math.floor(Math.random() * bgMusicUrls.length);
			}
			url = bgMusicUrls[index];
		}

		// Decode buffer if needed
		if (!bgMusicBuffers[url]) {
			const buf = await load(url);
			if (!buf) {
				// If a track fails, forcefully try the next one in the list immediately
				console.warn(`Force-skipping broken track: ${url}`);
				const nextIdx = (index + 1) % bgMusicUrls.length;
				return playBackgroundTrack(nextIdx);
			}
			bgMusicBuffers[url] = buf;
		}

		// Stop any existing source to ensure only one plays
		if (bgMusicSource) {
			try {
				bgMusicSource.onended = null;
				bgMusicSource.stop();
				bgMusicSource.disconnect();
			} catch (_e) {}
			bgMusicSource = null;
		}

		bgMusicSource = audioCtx.createBufferSource();
		bgMusicSource.buffer = bgMusicBuffers[url];
		bgMusicSource.loop = false;

		if (!bgMusicGain) {
			bgMusicGain = audioCtx.createGain();
			const savedVol = getCookie("mw_music_vol");
			const initialVol = savedVol !== "" ? parseFloat(savedVol) : 0.45; // Increased default volume
			bgMusicGain.gain.setValueAtTime(initialVol, audioCtx.currentTime);

			const slider = document.getElementById("music-volume-slider");
			const valLabel = document.getElementById("music-vol-val");
			if (slider && valLabel) {
				slider.value = initialVol;
				valLabel.innerText = `${Math.round(initialVol * 100)}%`;
			}

			bgMusicGain.connect(audioCtx.destination);
		}

		bgMusicSource.connect(bgMusicGain);

		try {
			bgMusicSource.start(0);
		} catch (e) {
			console.warn("Force play failed at start phase:", e);
		}

		currentBgTrackIndex = index;

		// When track ends, pick a different random one
		bgMusicSource.onended = () => {
			bgMusicSource = null;
			if (customTrackUrl) {
				playBackgroundTrack(0); // Loop custom track
				return;
			}
			if (!bgMusicUrls.length) return;
			let next = Math.floor(Math.random() * bgMusicUrls.length);
			if (bgMusicUrls.length > 1 && next === currentBgTrackIndex) {
				next = (next + 1) % bgMusicUrls.length;
			}
			playBackgroundTrack(next);
		};
	};

	// Prioritize loading and playing background music immediately
	const startMusic = async () => {
		if (bgMusicSource || isAudioLoading) return;
		// Pick a random starting track
		const startIndex = Math.floor(Math.random() * bgMusicUrls.length);
		await playBackgroundTrack(startIndex);
	};

	// Fire off music load/play and other sounds in parallel
	const effectTasks = [
		load(explosionUrl).then((b) => (explosionBuffer = b || explosionBuffer)),
		!clickBuffer
			? load(clickUrl).then((b) => (clickBuffer = b || clickBuffer))
			: Promise.resolve(),
		load(warStartUrl).then((b) => (warStartBuffer = b || warStartBuffer)),
		load(peaceUrl).then((b) => (peaceBuffer = b || peaceBuffer)),
		load(warAmbianceUrl).then(
			(b) => (warAmbianceBuffer = b || warAmbianceBuffer),
		),
	];

	try {
		await Promise.all([startMusic(), ...effectTasks]);
	} catch (e) {
		console.error("Audio initialization error:", e);
	} finally {
		isAudioLoading = false;
	}
}

export function playWarAmbiance() {
	if (!audioCtx || !warAmbianceBuffer || warAmbianceSource) return;

	warAmbianceSource = audioCtx.createBufferSource();
	warAmbianceSource.buffer = warAmbianceBuffer;
	warAmbianceSource.loop = true;

	warAmbianceGain = audioCtx.createGain();
	// Play "really quietly" as requested
	warAmbianceGain.gain.setValueAtTime(0, audioCtx.currentTime);
	warAmbianceGain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 2);

	warAmbianceSource.connect(warAmbianceGain);
	warAmbianceGain.connect(audioCtx.destination);
	warAmbianceSource.start(0);
}

export function stopWarAmbiance() {
	if (warAmbianceSource) {
		const sourceToStop = warAmbianceSource;
		const gainToStop = warAmbianceGain;

		if (gainToStop) {
			gainToStop.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
		}

		setTimeout(() => {
			try {
				sourceToStop.stop();
			} catch (_e) {}
		}, 1600);

		warAmbianceSource = null;
		warAmbianceGain = null;
	}
}

export function playExplosionSound() {
	if (isMuted || !audioCtx || !explosionBuffer) return;
	const source = audioCtx.createBufferSource();
	source.buffer = explosionBuffer;

	// Create a filter but make it less aggressive (higher cutoff)
	const filterNode = audioCtx.createBiquadFilter();
	filterNode.type = "lowpass";
	filterNode.frequency.setValueAtTime(1800, audioCtx.currentTime);
	filterNode.Q.setValueAtTime(1, audioCtx.currentTime);

	const gainNode = audioCtx.createGain();
	const startVol = 0.45; // Significantly increased volume for clarity
	gainNode.gain.setValueAtTime(startVol, audioCtx.currentTime);
	// Linear ramp is often more predictable for short samples
	gainNode.gain.linearRampToValueAtTime(
		0,
		audioCtx.currentTime + explosionBuffer.duration,
	);

	source.connect(filterNode);
	filterNode.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	source.start(0);
}

export function playClickSound() {
	if (isMuted || !audioCtx || !clickBuffer) return;
	const source = audioCtx.createBufferSource();
	source.buffer = clickBuffer;
	const gainNode = audioCtx.createGain();
	// Reduced gain to 0.1 to address the "too loud" feedback while maintaining auditability
	gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
	source.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	source.start(0);
}

export function playWarStartSound() {
	if (isMuted || !audioCtx || !warStartBuffer) return;
	const source = audioCtx.createBufferSource();
	source.buffer = warStartBuffer;
	const gainNode = audioCtx.createGain();
	gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime); // Quiet start
	source.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	source.start(0);
}

export function playPeaceSound() {
	if (isMuted || !audioCtx || !peaceBuffer) return;
	const source = audioCtx.createBufferSource();
	source.buffer = peaceBuffer;
	const gainNode = audioCtx.createGain();
	gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
	source.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	source.start(0);
}

// Global click listener using capture phase to ensure sounds play even when stopPropagation is used
document.addEventListener(
	"click",
	(e) => {
		// Auto-fullscreen on first gesture to comply with browser security policies
		if (!disableFullscreen && !document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => {
				// Silently fail if blocked or already handled
			});
		}

		// Resume context if suspended (common browser policy on first click)
		if (audioCtx && audioCtx.state === "suspended") {
			audioCtx.resume().catch(() => {});
		}

		// Attempt to start OST on any interaction if not already playing
		if (!bgMusicSource && !isAudioLoading) {
			initAudio();
		}

		const interactiveSelector =
			'button, .menu-card, input, select, [role="button"], .side-header';
		if (e.target.closest(interactiveSelector)) {
			playClickSound();
		}
	},
	true,
);

/**
 * CONFIGURATION & STATE
 */
export const BUFF_STATES = [
	"crippled",
	"weakened",
	"none",
	"buff",
	"super",
	"godly",
];
export const BUFF_METADATA = {
	crippled: {
		label: "MAJOR PENALTY",
		color: "#7b241c",
		textColor: "#fff",
		class: "crippled-active",
	},
	weakened: {
		label: "MINOR PENALTY",
		color: "#a04000",
		textColor: "#fff",
		class: "weakened-active",
	},
	none: { label: "NONE", color: "#444", textColor: "#fff", class: "" },
	buff: {
		label: "SMALL BUFF",
		color: "#f1c40f",
		textColor: "#000",
		class: "active",
	},
	super: {
		label: "MEDIUM BUFF",
		color: "#9b59b6",
		textColor: "#fff",
		class: "super-active",
	},
	godly: {
		label: "LARGE BUFF",
		color: "#ffffff",
		textColor: "#000",
		class: "godly-active",
	},
};

/**
 * Returns the buff state that should actually affect combat:
 * - If invisible buffs are enabled and a hidden buff exists (not 'none'), it overrides the visible buff.
 * - Otherwise, falls back to the visible buff or 'none'.
 */
export function getEffectiveBuffState(countryObj, meta) {
	const visible = countryObj?.buffState || meta?.buffState || "none";

	// If global invisible buffs are disabled, always use the visible buff only.
	if (!invisibleBuffsEnabled) return visible;

	const hidden =
		(countryObj && countryObj.hiddenBuffState !== undefined
			? countryObj.hiddenBuffState
			: null) ??
		(meta && meta.hiddenBuffState !== undefined ? meta.hiddenBuffState : null);
	if (hidden && hidden !== "none") return hidden;
	return visible;
}

/**
 * Cycle a buff state forwards (direction = 1) or backwards (direction = -1).
 */
export function cycleBuffState(current, direction) {
	if (!BUFF_STATES.length) return "none";
	const dir = direction === -1 ? -1 : 1;
	const idx = BUFF_STATES.indexOf(current);
	const baseIndex = idx === -1 ? 0 : idx;
	const nextIndex = (baseIndex + dir + BUFF_STATES.length) % BUFF_STATES.length;
	return BUFF_STATES[nextIndex];
}

export function getOptimizationFactor() {
	// More active sides => higher factor => more aggressive optimization
	const activeSides = sides.filter((s) => s && s.length > 0).length || 1;
	return Math.max(1, activeSides / 2);
}

export let gameState = "MAIN_MENU";
export let gameMode = "CONQUEST"; // 'CONQUEST' or 'EDITOR'
export let mapName = "Untitled Map";
export let worldWidthDeg = 360;
export let worldHeightDeg = 180;
export let missilesEnabled = true;
export let gameTimeEnabled = false;
export let gameTimeDate = null; // {year, month, day}
export let gameTimeAccumulatorMs = 0;
export let viewMode = "POLITICAL"; // 'POLITICAL' or 'FLAG'
export let allianceViewEnabled = false; // when true, alliances override colors/flags in political/flag views
export let showCountryLabels = true;
export let showNonCapitalCities = true;
// Cache for screen-space label curves so they don't move with the camera
export const countryLabelAnchors = new Map(); // key: `${countryId}:${regionIndex}` -> { name, points, fontSize }
export let showBattleIndicators = true;
export let showWarPlans = true;
export let cityFocusMode = false;
// High‑level commanders ("generals") for each side, used to model strong plans.
export let generals = [];
export const DEFAULT_SIDE_COLORS = [
	"rgba(255, 50, 50, 0.5)",
	"rgba(50, 100, 255, 0.5)",
	"rgba(255, 200, 0, 0.5)",
	"rgba(0, 200, 100, 0.5)",
	"rgba(180, 50, 220, 0.5)",
	"rgba(255, 130, 0, 0.5)",
	"rgba(0, 210, 210, 0.5)",
	"rgba(200, 200, 200, 0.5)",
];
export const MAX_SIDES = 8;
export let sides = [[], []];
export let _attackers = sides[0];
export let _defenders = sides[1];
export let activeSideIndex = 0;
export let activeScenarioId = null;
export let ffaMode = false;
export let randomWarMode = false;
export let adjacencyCache = null;
export let sideColors = [...DEFAULT_SIDE_COLORS];
export let lastSelectionTime = 0;
export let lastSelectedId = -1;
export const sideSoldiers = new Float64Array(MAX_SIDES);
export const initialSideSoldiers = new Float64Array(MAX_SIDES);
export const soldiersPerUnit = new Float64Array(MAX_SIDES).fill(
	CONFIG.UNIT_TO_SOLDIER_RATIO,
);
export const manualSideManpower = new Array(MAX_SIDES).fill(null);
export let units = [];
export let activeBattles = [];
export let _battleHash = new Map(); // spatial hash: gridKey -> battle index in activeBattles
export let capitalLostCountries = new Set();
export let bombs = [];
export let explosions = [];
export let bases = [];
export let cities = [];
export let activeTheaterCities = [];

export let influenceLayer = null;
export let rawGeoJsonData = null;
export let customCountryData = {
	name: "",
	color: "",
	flagUrl: null,
};
export let editingCountryId = -1;
export let editingCityId = -1;
export const selectedCountryIds = new Set();
export let selectingOverlordForId = -1;
export let selectingAllyForId = -1;
export let peaceSelection1 = null;
export let isPainting = false;
export let lastPaintLatLng = null;
export let brushSize = 0.5;
export let isCustomTerrain = false;
export let cinematicMode = false;
export let mediaRecorder = null;
export let recordedChunks = [];

// Overlay System State
export let customSatelliteUrl = null;
export let customSatelliteImg = null;
export let referenceImageUrl = null;
export let referenceOverlay = null; // L.imageOverlay
export let refHandles = []; // Array of Leaflet markers
export let refOpacity = 0.5;
export let refScale = 1.0;
export let refAboveTerrain = false;
export let paintMaskId = -1; // -1 means no mask, >= 0 restricts painting to that ID
export let peaceTreatiesDisabled = false;
export let bombsDisabled = false;
export let activeRebellion = null; // { rebelId, overlordId }
export let mountainsEnabled = true;
export let _provincesEnabled = false;
export let showUnitsVisually = true;
export let disableCountryGradient = false;
// When false, hiddenBuffState is ignored and only visible buffState is used.
export let invisibleBuffsEnabled =
	getCookie("mw_disable_invis_buffs") !== "true";
export let cityEditMode = null; // 'CREATE' | 'MOVE' | null
export let animationFrameId = null;
export let backgroundTickId = null;
export let simFrameCount = 0;
let warGraceEndTick = 0;
export let simSpeed = 3.0;
let _perfLastTime = 0;
let _perfFrameTimeSum = 0;
let _perfFrameCount = 0;
let _isBenchmarking = false;
let _perfBenchmarkEnd = 0;
let _perfSamples = [];
export let _cachedP1T = 0,
	_cachedP2T = 0;
export let _cachedSoldierEls = [];
export let _cachedSideUnitCounts = [];
export let _cachedSideSoldierEsts = [];
export let _cachedSideTerritoryCounts = [];
export let _cachedSideTerritoryPcts = [];
export let _cachedCityEls = [];
export let _cachedUnitCountSpans = [];
export let _cachedTerritoryCtrlEls = [];
export let _cachedTerritorySegEls = [];
export let _casualtyStructureKey = "";
export let _casualtyValueEls = {};
export let isPaused = false;
export let frameAccumulator = 0;
export let lastTreatyTime = 0;
export const sideCasualties = new Float64Array(MAX_SIDES);
export const countryCasualties = new Map();
export const casualtyByAttacker = new Map(); // Map<victimCountryId, Map<attackerSovereignId, loss>>
export let initialCombatants = []; // Tracks nations that started the war for stable casualty menu display
export let room = null;
export let currentUsername = null;
export let flagCodes = null;
export let isMuted = false;
export let currentScenarioContext = null; // { id, name, ownerUsername }
export let hubReturnState = null;
export let hubWasInEditor = false;
export let godModeActive = false;
export let godBombActive = false;
export let godBombSourceId = -1;
export let preGodModeState = "SIMULATING";
export const latestCountryStats = new Map();
export let disableFullscreen = getCookie("mw_disable_fullscreen") === "true";

// High-performance spatial cache for unit culling and combat
export const unitSpatialHash = new Map();
export const UNIT_HASH_CELL_SIZE = 2.5; // Degrees per spatial bucket

// Phase 2.1: Persistent tick caches (reused via .clear() to reduce GC pressure)
const _tickCombatantIds = new Set();
const _tickCountryToSideMap = new Map();
const _tickCountryToCityCount = new Map();
const _tickCountryCapitalLost = new Map();
const _tickCitiesBySovereign = new Map();
const _tickMetadataById = new Map();
const _tickCityGridIndexSet = new Set();
const _tickSideAllyIdSets = [];
const _tickSideSupportIdSets = [];
const _tickUnitsBySide = [];

// Temporary diagnostics for cross-war state/capitulation bugs.
export const aiCountryState = new Map();
export let _sidePosture = []; // per-side auto posture (OFFENSIVE/BALANCED/DEFENSIVE)
export let _warPlan = []; // per-side war plan: { type, phase, target, ... }
export const _navalPlan = []; // per-side naval invasion plan (1 per side max)
export const _navalSupplyPlan = []; // per-side naval supply run plan (1 per side max)
export const _coastalDefensePlan = []; // per-side coastal defense passive overlay
export const _neutralGarrisonPlan = []; // per-side neutral border garrison plans
export const _defenderReactionPlan = []; // per-side emergency DEFEND at enemy naval beachhead
const _proposalReassessTick = []; // per-side last reassessment tick
const _proposalsCache = []; // per-side cached scored proposals
const _planReassessNeeded = []; // per-side flag: force immediate reassessment
const _sidePrevControlled = []; // per-side total controlled cells on last territory check
const _sidePrevStrengthRatio = []; // per-side force ratio vs enemies
const _sidePrevPosture = []; // per-side posture string from previous tick
export const WAR_PLAN_TYPES = [
	"DEFEND",
	"PUSH_FRONT",
	"CAPTURE_CITY",
	"ENCIRCLE",
	"NAVAL_INVASION",
	"NAVAL_SUPPLY",
	"COASTAL_DEFENSE",
	"NEUTRAL_GARRISON",
];
export const WAR_PLAN_PHASES = [
	"PREPARATION",
	"EXECUTION",
	"CONSOLIDATION",
	"GATHERING",
	"EMBARKATION",
	"TRANSIT",
	"LANDING",
	"DELIVERED",
];
export const AI_DESPERATION = {
	OFFENSE_MIN_WAR_TICKS: 1200, // ~20s at 60fps
	OFFENSE_STALL_TICKS: 900, // sustained stall before "push harder"
	OFFENSE_STALL_DELTA_FRAC: 0.002, // <=0.2% map gain counts as stalled
	DEFENSE_TRIGGER_RATIO: 0.4, // under 40% land -> defensive desperation
	LAST_STAND_TRIGGER_RATIO: 0.22, // under 22% land -> last stand
	CITY_RATIO_DEFENSE_TRIGGER: 0.35, // under 35% of starting cities -> defensive desperation
	CITY_RATIO_LAST_STAND_TRIGGER: 0.2, // under 20% of starting cities -> last stand
	PEACE_PRESSURE_PROPOSAL_BASE: 0.001, // base treaty proposal chance
	PEACE_PRESSURE_PROPOSAL_MULT_MAX: 5.0, // cap additional desperation pressure
};
export const AI_MOBILIZATION = {
	INITIAL_SPAWN_FRAC: 0.18, // spawn ~18% of theoretical force at war start
	INITIAL_SPAWN_MIN: 2, // each nation starts with a tiny standing force
	START_FROM_FRONT_CHANCE: 0.25, // mostly start behind lines, not fully on border
	EARLY_TICKS: 1800, // first ~30s at 60fps = mobilization phase
	EARLY_RECRUIT_MULT: 2.3, // recruit faster early to fill armies over time
};

// Frontline Distance Field: pre-computed per-cell direction toward nearest frontline cell.
// Updated once every FRONTLINE_FIELD_UPDATE_INTERVAL ticks instead of scanning per-unit.
// Each entry stores [dirLat, dirLng] packed as two Float32 values.
export let frontlineDirLat = null; // Float32Array, length = gridWidth * gridHeight
export let frontlineDirLng = null; // Float32Array, length = gridWidth * gridHeight
export let frontlineFieldTick = -999; // last simFrameCount when field was rebuilt
export let _frontlineSourceCell = null; // reusable Int32Array for BFS — allocated once
export const FRONTLINE_FIELD_UPDATE_INTERVAL = 15; // rebuild every N ticks (not every 4 — grid is 2.88M cells)
export let _simWorker = null; // Web Worker for async frontline BFS
export let _workerBusy = false;
// Frontline polyline system: distributed unit stationing along war fronts
export let _frontlinePolys = {};
export let _neutralBorderPolys = {}; // combatant-vs-neutral border polylines for garrison stationing
export let _frontlinePolyTick = -999;
export const FRONTLINE_POLY_UPDATE_INTERVAL = 15;
export let _cachedFrontierCells = []; // cached BFS frontier seed cells (incremental rebuild)
export let _frontierScanCounter = 0; // counter for full-scan cadence

// Grid dimensions calculated after settings choice
export let gridWidth,
	gridHeight,
	worldControlMap,
	deJureMap,
	provinceMap,
	occupationMap,
	sideInfluenceMaps,
	dominantSideMap,
	primaryOccupierMap,
	landMask,
	biomeMask,
	terrainMask;
export function setBombsDisabled(val) {
	bombsDisabled = val;
}
export function setCities(val) {
	cities = val;
}
export function setCountryMetadata(val) {
	countryMetadata = val;
}
export function setCustomSatelliteImg(val) {
	customSatelliteImg = val;
}
export function setCustomSatelliteUrl(val) {
	customSatelliteUrl = val;
}
export function setGameState(val) {
	gameState = val;
}
export function setHubReturnState(val) {
	hubReturnState = val;
}
export function setHubWasInEditor(val) {
	hubWasInEditor = val;
}
export function setGodBombActive(val) {
	godBombActive = val;
}
export function setGodBombSourceId(val) {
	godBombSourceId = val;
}
export function setBuffedSideIdx(val) {
	buffedSideIdx = val;
}
export function setImportScenarioBuffer(val) {
	importScenarioBuffer = val;
}
export function setDisableCountryGradient(val) {
	disableCountryGradient = val;
}
export function setGameMode(val) {
	gameMode = val;
}
export function setInitialCitiesSnapshot(val) {
	initialCitiesSnapshot = val;
}
export function setInitialCountryMetadataSnapshot(val) {
	initialCountryMetadataSnapshot = val;
}
export function setInitialDeJureMapSnapshot(val) {
	initialDeJureMapSnapshot = val;
}
export function setInitialLandMaskSnapshot(val) {
	initialLandMaskSnapshot = val;
}
export function setInitialProvinceMapSnapshot(val) {
	initialProvinceMapSnapshot = val;
}
export function setInitialWorldControlMapSnapshot(val) {
	initialWorldControlMapSnapshot = val;
}
export function setIsCustomTerrain(val) {
	isCustomTerrain = val;
}
export function setMissilesEnabled(val) {
	missilesEnabled = val;
}
export function setRawGeoJsonData(val) {
	rawGeoJsonData = val;
}
export function setRefAboveTerrain(val) {
	refAboveTerrain = val;
}
export function setReferenceImageUrl(val) {
	referenceImageUrl = val;
}
export function setSelectedImportCountryId(val) {
	selectedImportCountryId = val;
}
export function setHubScenarioCache(val) {
	hubScenarioCache = val;
}
export function setQueuedScenarioAction(val) {
	queuedScenarioAction = val;
}
export function setRefOpacity(val) {
	refOpacity = val;
}
export function setRefScale(val) {
	refScale = val;
}
export function setSideInfluenceMaps(val) {
	sideInfluenceMaps = val;
}
export function setFrontlinePolys(val) {
	_frontlinePolys = val;
}
export function setNeutralBorderPolys(val) {
	_neutralBorderPolys = val;
}
export function setDominantSideMap(val) {
	dominantSideMap = val;
}
export function setReferenceOverlay(val) {
	referenceOverlay = val;
}
export function setFrontlineDirLat(val) {
	frontlineDirLat = val;
}
export function setFrontlineDirLng(val) {
	frontlineDirLng = val;
}
export function set_frontlineSourceCell(val) {
	_frontlineSourceCell = val;
}
export function setFrontierScanCounter(val) {
	_frontierScanCounter = val;
}

// ── State setters for module imports (ES imports are read-only) ────
export function setAdjacencyCache(val) {
	adjacencyCache = val;
}

// Snapshots of borders at scenario start for quick restart
export let initialWorldControlMapSnapshot = null;
export let initialDeJureMapSnapshot = null;
export let initialProvinceMapSnapshot = null;
export let initialLandMaskSnapshot = null;
export let initialBiomeMaskSnapshot = null;
// Snapshots for releasables and metadata at scenario start so annexed nations are still releasable on quick restart
export let initialCountryMetadataSnapshot = null;
export let initialCitiesSnapshot = null;
export let flagProcessedBuffer;
export let countryMetadata = []; // Stores {feature, color, id}

// UI Elements
export const addSideBtn = document.getElementById("add-side-btn");
export const ffaToggleBtn = document.getElementById("ffa-toggle-btn");
export const sidesContainer = document.getElementById("sides-container");
export const editorToolbox = document.getElementById("editor-toolbox");
export const editorCreateBtn = document.getElementById("editor-create-btn");
export const editorTestBtn = document.getElementById("editor-test-btn");
export const editorUpdateBtn = document.getElementById("editor-update-btn");
export const editorSaveBtn = document.getElementById("editor-save-btn");
export const editorLoadBtn = document.getElementById("editor-load-btn");
export const editorShareBtn = document.getElementById("editor-share-btn");
export const editorHubBtn = document.getElementById("editor-hub-btn");
export const editorLibraryBtn = document.getElementById("editor-library-btn");
export const editorFlagLibraryBtn = document.getElementById(
	"editor-flag-library-btn",
);
export const editorPaintBtn = document.getElementById("editor-paint-btn");
export const editorFillBtn = document.getElementById("editor-fill-btn");
export const editorUnclaimBtn = document.getElementById("editor-unclaim-btn");
export const editorTerrainBtn = document.getElementById("editor-terrain-btn");
export const terrainTypeSelect = document.getElementById("terrain-type-select");
export const terrainControls = document.getElementById("terrain-controls");
export const editorPlaceDivisionBtn = document.getElementById(
	"editor-place-division-btn",
);
export const editorSaveMultiBtn = document.getElementById(
	"editor-save-multi-btn",
);
export const editorSaveAllZipBtn = document.getElementById(
	"editor-save-all-zip-btn",
);
export const editorLoadZipBtn = document.getElementById("editor-load-zip-btn");
export const editorImportCountryBtn = document.getElementById(
	"editor-import-country-from-scenario-btn",
);
export const editorCityNewBtn = document.getElementById("editor-city-new-btn");
export const editorCityClearBtn = document.getElementById(
	"editor-city-clear-btn",
);
export const editorToolsPage1Btn = document.getElementById(
	"editor-tools-page-1-btn",
);
export const editorToolsPage2Btn = document.getElementById(
	"editor-tools-page-2-btn",
);
export const editorToolsPage3Btn = document.getElementById(
	"editor-tools-page-3-btn",
);
export const editorToolsPage4Btn = document.getElementById(
	"editor-tools-page-4-btn",
);
export const editorToolsPage5Btn = document.getElementById(
	"editor-tools-page-5-btn",
);
export const editorExitBtn = document.getElementById("editor-exit-btn");
export const editorMapSettingsBtn = document.getElementById(
	"editor-map-settings-btn",
);
export const brushControls = document.getElementById("brush-controls");
export const brushSizeSlider = document.getElementById("brush-size-slider");
export const brushSizeVal = document.getElementById("brush-size-val");
export const viewModeBtn = document.getElementById("view-mode-btn");
export const arrowsToggleBtn = document.getElementById("arrows-toggle-btn");
export const battlesToggleBtn = document.getElementById("battles-toggle-btn");
export const labelsToggleBtn = document.getElementById("labels-toggle-btn");
export const citiesToggleBtn = document.getElementById("cities-toggle-btn");
export const warplansToggleBtn = document.getElementById("warplans-toggle-btn");
export const allianceViewCheckbox = document.getElementById(
	"alliance-view-checkbox",
);

// Fully retire the legacy ARROWS button so it no longer appears or controls alliance view.
if (arrowsToggleBtn) {
	arrowsToggleBtn.style.display = "none";
}

export const scenarioHubModal = document.getElementById("scenario-hub-modal");
export const hubList = document.getElementById("hub-list");
export const libraryList = document.getElementById("library-list");
export const flagLibraryList = document.getElementById("flag-library-list");
export const closeHubBtn = document.getElementById("close-hub-btn");
export const tabScenariosBtn = document.getElementById("tab-scenarios-btn");
export const tabCountriesBtn = document.getElementById("tab-countries-btn");
export const tabFlagsBtn = document.getElementById("tab-flags-btn");

// Item details + comments modal elements
export const itemCommentModal = document.getElementById("item-comment-modal");
export const itemModalTitle = document.getElementById("item-modal-title");
export const itemModalDesc = document.getElementById("item-modal-desc");
export const itemModalPreview = document.getElementById("item-modal-preview");
export const itemCommentsList = document.getElementById("item-comments-list");
export const itemCommentInput = document.getElementById("item-comment-input");
export const itemCommentSubmit = document.getElementById("item-comment-submit");
export const itemReplyIndicator = document.getElementById(
	"item-reply-indicator",
);
export const itemCancelReplyBtn = document.getElementById(
	"item-comment-cancel-reply",
);
export const closeItemModalBtn = document.getElementById(
	"close-item-modal-btn",
);
export const itemModalActions = document.getElementById("item-modal-actions");
export const itemModalPlayBtn = document.getElementById("item-modal-play");
export const itemModalRemixBtn = document.getElementById("item-modal-remix");

// Global chat modal elements
export const globalChatModal = document.getElementById("global-chat-modal");
export const globalChatList = document.getElementById("global-chat-list");
export const globalChatInput = document.getElementById("global-chat-input");
export const globalChatSend = document.getElementById("global-chat-send");
export const globalChatClose = document.getElementById("global-chat-close");

// Hub caches for item details
export let hubScenarioCache = {};
export let hubCountryCache = {};
export let hubFlagCache = {};

// Comment state
export let currentCommentItemType = null;
export let currentCommentItemId = null;
export let currentReplyParentId = null;
export let currentEditingCommentId = null;
export let commentsUnsubscribe = null;

// Global chat state
export let globalChatUnsubscribe = null;

export const uploadDetailsModal = document.getElementById(
	"upload-details-modal",
);
export const confirmUploadBtn = document.getElementById("confirm-upload-btn");
export const cancelUploadBtn = document.getElementById("cancel-upload-btn");
export const uploadNameInput = document.getElementById("upload-scenario-name");
export const uploadDescInput = document.getElementById("upload-scenario-desc");

export const shareCountryModal = document.getElementById("share-country-modal");
export const confirmShareCountryBtn = document.getElementById(
	"confirm-share-country-btn",
);
export const cancelShareCountryBtn = document.getElementById(
	"cancel-share-country-btn",
);
export const shareCountryNameInput =
	document.getElementById("share-country-name");
export const shareCountryDescInput =
	document.getElementById("share-country-desc");

export const shareFlagModal = document.getElementById("share-flag-modal");
export const releaseModal = document.getElementById("release-modal");
export const releasableListContainer =
	document.getElementById("releasable-list");
export const closeReleaseModalBtn = document.getElementById(
	"close-release-modal",
);
export const confirmShareFlagBtn = document.getElementById(
	"confirm-share-flag-btn",
);
export const cancelShareFlagBtn = document.getElementById(
	"cancel-share-flag-btn",
);
export const shareFlagNameInput = document.getElementById("share-flag-name");
export const shareFlagDescInput = document.getElementById("share-flag-desc");
export const shareFlagBtn = document.getElementById("share-flag-btn");

export const createCountryModal = document.getElementById(
	"create-country-modal",
);
export const confirmCreateBtn = document.getElementById("confirm-create-btn");
export const cancelCreateBtn = document.getElementById("cancel-create-btn");
export const newCountryNameInput = document.getElementById("new-country-name");
export const newCountryColorInput =
	document.getElementById("new-country-color");
export const newCountryFlagInput = document.getElementById("new-country-flag");

export const countryInspector = document.getElementById("country-inspector");
export const inspectNameInput = document.getElementById("inspect-name-input");
export const inspectFlagInput = document.getElementById("inspect-flag-input");
export const inspectFetchFlagBtn = document.getElementById(
	"inspect-fetch-flag-btn",
);
export const inspectHubFlagBtn = document.getElementById(
	"inspect-hub-flag-btn",
);
export const inspectFlagPreview = document.getElementById(
	"inspect-flag-preview",
);
export const inspectColorSwatch = document.getElementById(
	"inspect-color-swatch",
);
export const inspectColorPicker = document.getElementById(
	"inspect-color-picker",
);
export const inspectPaintBtn = document.getElementById("inspect-paint-btn");
export const inspectAnnexClickBtn = document.getElementById(
	"inspect-annex-click-btn",
);
export const shareCountryBtn = document.getElementById("share-country-btn");
export const closeInspectorBtn = document.getElementById("close-inspector-btn");
export const inspectBuffBtn = document.getElementById("inspect-buff-btn");
export const annexCountryInput = document.getElementById("annex-country-input");
export const annexCountryBtn = document.getElementById("annex-country-btn");
export const addAllyBtn = document.getElementById("add-ally-btn");
export const clearAlliesBtn = document.getElementById("clear-allies-btn");
export const allyList = document.getElementById("ally-list");
export const allianceFlagInput = document.getElementById("alliance-flag-input");

// City inspector elements
export const cityInspector = document.getElementById("city-inspector");

// Import-from-scenario modal elements
export const importCountryModal = document.getElementById(
	"import-country-modal",
);
export const importScenarioSelect = document.getElementById(
	"import-scenario-select",
);
export const importScenarioFileInput = document.getElementById(
	"import-scenario-file",
);
export const importCountrySearch = document.getElementById(
	"import-country-search",
);
export const importCountryCardList = document.getElementById(
	"import-country-card-list",
);
export const importCountryConfirmBtn = document.getElementById(
	"import-country-confirm-btn",
);
export const importCountryCancelBtn = document.getElementById(
	"import-country-cancel-btn",
);

// Temporary holder for loaded scenario used for country import
export let importScenarioBuffer = null; // { metadata, mapData, gridRes }
export let selectedImportCountryId = null;
export let importScenarioCountriesCache = []; // [{id,name,tiles,flagUrl}]
// Remember which scenario option was last used for import (e.g. builtin:modern_2022)
export let lastImportScenarioKey = null;

export function renderImportCountryCards(filterText = "") {
	if (!importCountryCardList) return;
	const ft = (filterText || "").toLowerCase();
	const filtered = importScenarioCountriesCache.filter(
		(c) => !ft || c.name.toLowerCase().includes(ft),
	);

	if (!filtered.length) {
		importCountryCardList.innerHTML = `
            <div style="font-size:11px; color:#777; text-align:center; padding:10px;">
                No countries match that search.
            </div>
        `;
		return;
	}

	importCountryCardList.innerHTML = filtered
		.map((c) => {
			const selectedClass = c.id === selectedImportCountryId ? " selected" : "";
			const tilesLabel = c.tiles.toLocaleString();
			const flagHtml = c.flagUrl
				? `<img src="${c.flagUrl}" class="import-country-flag">`
				: `<div class="import-country-flag" style="background:#000;"></div>`;
			return `
            <div class="import-country-card${selectedClass}" data-country-id="${c.id}">
                ${flagHtml}
                <div style="flex:1; min-width:0;">
                    <div class="import-country-name">${c.name}</div>
                    <div class="import-country-tiles">${tilesLabel} tiles</div>
                </div>
            </div>
        `;
		})
		.join("");

	// Wire selection handlers
	importCountryCardList
		.querySelectorAll(".import-country-card")
		.forEach((card) => {
			card.addEventListener("click", () => {
				const id = parseInt(card.getAttribute("data-country-id") || "0", 10);
				if (!id) return;
				selectedImportCountryId = id;
				importCountryCardList
					.querySelectorAll(".import-country-card")
					.forEach((c) => {
						c.classList.remove("selected");
					});
				card.classList.add("selected");
			});
		});
}

// Hook search box once
if (importCountrySearch) {
	importCountrySearch.addEventListener("input", () => {
		renderImportCountryCards(importCountrySearch.value);
	});
}
export const cityNameInput = document.getElementById("city-name-input");
export const cityOwnerSelect = document.getElementById("city-owner-select");
export const cityCapitalCheckbox = document.getElementById(
	"city-capital-checkbox",
);
export const cityMoveBtn = document.getElementById("city-move-btn");
export const cityDeleteBtn = document.getElementById("city-delete-btn");
export const cityCloseBtn = document.getElementById("city-close-btn");

export const presetLowBtn = document.getElementById("preset-low-btn");
export const presetDefaultBtn = document.getElementById("preset-default-btn");
export const launchBtn = document.getElementById("launch-btn");
export const musicVolumeSlider = document.getElementById("music-volume-slider");
export const musicVolVal = document.getElementById("music-vol-val");
export const saveSkipCheckbox = document.getElementById("save-skip-checkbox");
export const mapResSelect = document.getElementById("map-res-select");
export const gridResSelect = document.getElementById("grid-res-select");
export const unitLimitSelect = document.getElementById("unit-limit-select");
export const customTrackInput = document.getElementById("custom-track-input");
export const clearCustomTrackBtn = document.getElementById(
	"clear-custom-track-btn",
);
export const disableUnitsVisuallyCheckbox = document.getElementById(
	"disable-units-visually-checkbox",
);
export const disableAutoFullscreenCheckbox = document.getElementById(
	"disable-auto-fullscreen-checkbox",
);
export const disableCountryGradientCheckbox = document.getElementById(
	"disable-country-gradient-checkbox",
);
export const useSystemFontCheckbox = document.getElementById(
	"use-system-font-checkbox",
);
export const disableInvisibleBuffsCheckbox = document.getElementById(
	"disable-invisible-buffs-checkbox",
);
export const benchmarkBtn = document.getElementById("benchmark-btn");
export const perfOverlay = document.getElementById("perf-overlay");
export const benchmarkResults = document.getElementById("benchmark-results");
export const benchmarkStatsEl = document.getElementById("benchmark-stats");
export const benchmarkDismissBtn = document.getElementById(
	"benchmark-dismiss-btn",
);

// Persist core engine settings the moment they change
if (mapResSelect) {
	mapResSelect.addEventListener("change", (e) => {
		setCookie("mw_map_res", e.target.value);
	});
}
if (gridResSelect) {
	gridResSelect.addEventListener("change", (e) => {
		setCookie("mw_grid_res", e.target.value);
	});
}
if (unitLimitSelect) {
	unitLimitSelect.addEventListener("change", (e) => {
		setCookie("mw_unit_limit", e.target.value);
	});
}
if (disableUnitsVisuallyCheckbox) {
	disableUnitsVisuallyCheckbox.addEventListener("change", (e) => {
		setCookie("mw_disable_units_visually", e.target.checked ? "true" : "false");
	});
}
if (disableCountryGradientCheckbox) {
	disableCountryGradientCheckbox.addEventListener("change", (e) => {
		setCookie(
			"mw_disable_country_gradient",
			e.target.checked ? "true" : "false",
		);
	});
}
if (saveSkipCheckbox) {
	saveSkipCheckbox.addEventListener("change", (e) => {
		setCookie("mw_skip_settings", e.target.checked ? "true" : "false");
	});
}

if (disableAutoFullscreenCheckbox) {
	disableAutoFullscreenCheckbox.addEventListener("change", (e) => {
		disableFullscreen = e.target.checked;
		setCookie("mw_disable_fullscreen", disableFullscreen ? "true" : "false");
	});
}

if (useSystemFontCheckbox) {
	useSystemFontCheckbox.addEventListener("change", (e) => {
		if (e.target.checked) {
			document.body.classList.add("use-system-font");
		} else {
			document.body.classList.remove("use-system-font");
		}
		setCookie("mw_use_system_font", e.target.checked ? "true" : "false");
	});
}

export const settingsOverlay = document.getElementById("settings-overlay");
export const mainMenu = document.getElementById("main-menu");
export const loadingOverlay = document.getElementById("loading-overlay");

// Helper to update loading UI across both standard and thematic containers
export const updateLoadingText = (status, progress = null, tip = null) => {
	if (status !== undefined) {
		document.querySelectorAll(".loading-status-text").forEach((el) => {
			el.innerText = status;
		});
	}
	if (progress !== null) {
		const pct = typeof progress === "string" ? progress : `${progress}%`;
		document.querySelectorAll(".loading-bar-fill-el").forEach((el) => {
			el.style.width = pct;
		});
	}
	if (tip !== null) {
		document.querySelectorAll(".loading-tip-text").forEach((el) => {
			el.innerText = tip;
		});
	}
};

// Define proxy objects for backward compatibility with existing code
export const loadingStatus = {
	set innerText(val) {
		updateLoadingText(val);
	},
	get innerText() {
		return document.querySelector(".loading-status-text")?.innerText;
	},
	style: {
		set color(val) {
			document.querySelectorAll(".loading-status-text").forEach((el) => {
				el.style.color = val;
			});
		},
	},
};
export const loadingBar = {
	style: {
		set width(val) {
			updateLoadingText(undefined, val);
		},
	},
};
export const loadingTip = {
	set innerText(val) {
		updateLoadingText(undefined, null, val);
	},
	get innerText() {
		return document.querySelector(".loading-tip-text")?.innerText;
	},
};

export function setLoadingThematic(enabled) {
	if (enabled) {
		loadingOverlay.classList.add("thematic-overlay");
	} else {
		loadingOverlay.classList.remove("thematic-overlay");
	}
}
export const playModeBtn = document.getElementById("play-mode-btn");
export const editorChoiceModal = document.getElementById("editor-choice-modal");
export const choiceIngameEditor = document.getElementById(
	"choice-ingame-editor",
);
export const choiceExternalEditor = document.getElementById(
	"choice-external-editor",
);
export const cancelEditorChoice = document.getElementById(
	"cancel-editor-choice",
);

export const editorSourceModal = document.getElementById("editor-source-modal");
export const choiceSourceEarth = document.getElementById("choice-source-earth");
export const choiceSourceBlank = document.getElementById("choice-source-blank");
export const cancelSourceChoice = document.getElementById(
	"cancel-source-choice",
);

export const mapSettingsModal = document.getElementById("map-settings-modal");
export const mapSettingsNameInput = document.getElementById(
	"map-settings-name-input",
);
export const mapSettingsWidthInput = document.getElementById(
	"map-settings-width-input",
);
export const mapSettingsHeightInput = document.getElementById(
	"map-settings-height-input",
);
export const mapSettingsMissilesCheckbox = document.getElementById(
	"map-settings-missiles-checkbox",
);
export const mapSettingsApplyBtn = document.getElementById(
	"map-settings-apply-btn",
);
export const mapSettingsCancelBtn = document.getElementById(
	"map-settings-cancel-btn",
);

export const conquestChoiceModal = document.getElementById(
	"conquest-choice-modal",
);

export const eraPageModern = document.getElementById("era-page-modern");
export const eraPageWars = document.getElementById("era-page-wars");
export const choiceModernDay = document.getElementById("choice-modern-day");
export const choice1936Scenario = document.getElementById(
	"choice-1936-scenario",
);
export const choiceWW1Scenario = document.getElementById("choice-ww1-1914");
export const cancelConquestChoice = document.getElementById(
	"cancel-conquest-choice",
);
export const mainSettingsBtn = document.getElementById("main-settings-btn");
export const minimizeSetupBtn = document.getElementById("minimize-setup-btn");
export const minimizeStatsBtn = document.getElementById("minimize-stats-btn");
export const minimizeStatusBtn = document.getElementById("minimize-status-btn");
export const muteBtn = document.getElementById("mute-btn");
export const ingameSettingsBtn = document.getElementById("ingame-settings-btn");

export const tutorialOverlay = document.getElementById("tutorial-overlay");
export const tutorialStepContainer = document.getElementById(
	"tutorial-step-container",
);
export const tutorialPrevBtn = document.getElementById("tutorial-prev-btn");
export const tutorialNextBtn = document.getElementById("tutorial-next-btn");
export const tutorialDotsContainer = document.getElementById("tutorial-dots");

export let currentTutorialStep = 0;
export let tutorialActive = false;
export let activeTutorialSet = [];
export let activeTutorialKey = "mw_tutorial_finished";

export const conquestTutorialSteps = [
	{
		icon: "⚔️",
		title: "Welcome Commander",
		content:
			"Modern Wars is a grand strategy simulation of <b>organic frontlines</b>. Let's walk through a basic engagement setup.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "🌍",
		title: "Initialize World",
		content:
			"First, let's load the global theater. Click 'Next' to initialize the engine.",
		actionRequired: "LOAD_MAP",
	},
	{
		icon: "🇩🇪",
		title: "Recruit Side A",
		content:
			"We need an aggressor. Find <b>Germany</b> on the map and click it to recruit for Side A.",
		actionRequired: "SELECT_GERMANY",
	},
	{
		icon: "🇵🇱",
		title: "Recruit Side B",
		content:
			"Now for the opposition. Switch to <b>Side B</b> in the setup panel, then click <b>Poland</b> on the map.",
		actionRequired: "SELECT_POLAND",
	},
	{
		icon: "⚔️",
		title: "Launch Operation",
		content:
			"Both sides are ready. Click <b>Inaugurate Conflict</b> to begin the simulation.",
		actionRequired: "START_WAR",
	},
	{
		icon: "🛡️",
		title: "The Frontline",
		content:
			"The war is live! Units will now push borders organically. You can use <b>God Mode</b> to edit the map while the simulation runs. Good luck, Commander.",
		actionRequired: "CLICK_FINISH",
	},
];

export const editorTutorialSteps = [
	{
		icon: "🛠️",
		title: "World Builder",
		content:
			"Welcome to the <b>Satellite Editor</b>. Here you can redraw history or create entirely new worlds from scratch.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "🏳️",
		title: "Establish Nations",
		content:
			"First, click the <b>New Nation</b> button in the top-left toolbox. Define its name and color, then <b>click on the map</b> to establish its capital.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "🎨",
		title: "Painting Borders",
		content:
			"Once a nation exists, <b>select it</b> on the map to open the <b>Inspector</b>. Use the <b>Manual Paint</b> tool to grow its territory cell by cell.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "📐",
		title: "Annexation Tool",
		content:
			"Want modern borders instantly? Use the <b>Annex Tool</b> in the Inspector. Type a name like <b>'France'</b> to absorb its real-world territory.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "📥",
		title: "The Library",
		content:
			"Don't build alone. The <b>Country Library</b> lets you import nations designed by the community directly into your map.",
		actionRequired: "CLICK_NEXT",
	},
	{
		icon: "💾",
		title: "Share Your Vision",
		content:
			"Once your map is complete, use <b>Save Preset</b> to keep it locally, or <b>Share to Hub</b> for others to play and remix!",
		actionRequired: "CLICK_FINISH",
	},
];

export function updateTutorialUI() {
	const step = activeTutorialSet[currentTutorialStep];
	if (!step) return;

	// Move the tutorial panel to the right for step 4 (index 3) of the Conquest tutorial
	// to prevent it from overlapping the Side B recruitment list.
	if (
		activeTutorialKey === "mw_tutorial_finished" &&
		currentTutorialStep === 3
	) {
		tutorialOverlay.style.justifyContent = "flex-end";
		tutorialOverlay.style.paddingLeft = "0";
		tutorialOverlay.style.paddingRight = "5%";
	} else {
		tutorialOverlay.style.justifyContent = "flex-start";
		tutorialOverlay.style.paddingLeft = "5%";
		tutorialOverlay.style.paddingRight = "0";
	}

	tutorialStepContainer.innerHTML = `
        <div class="tutorial-step">
            <div class="tutorial-header">
                <span class="tutorial-icon">${step.icon}</span>
                <h2 class="tutorial-title">${step.title}</h2>
            </div>
            <div class="tutorial-body">${step.content}</div>
        </div>
    `;

	tutorialPrevBtn.style.visibility =
		currentTutorialStep === 0 ? "hidden" : "visible";
	tutorialNextBtn.innerText =
		currentTutorialStep === activeTutorialSet.length - 1 ? "Finish" : "Next";

	const needsAction =
		step.actionRequired !== "CLICK_NEXT" &&
		step.actionRequired !== "CLICK_FINISH" &&
		step.actionRequired !== "LOAD_MAP";
	tutorialNextBtn.disabled = needsAction;
	tutorialNextBtn.style.opacity = needsAction ? "0.5" : "1";

	tutorialDotsContainer.innerHTML = activeTutorialSet
		.map(
			(_, i) =>
				`<div class="dot ${i === currentTutorialStep ? "active" : ""}"></div>`,
		)
		.join("");

	if (step.actionRequired === "LOAD_MAP") {
		tutorialNextBtn.onclick = () => {
			// Automatically trigger Modern Day scenario loading to skip the selection modal
			choiceModernDay.click();
			advanceTutorial();
		};
	} else {
		tutorialNextBtn.onclick = () => {
			if (currentTutorialStep < activeTutorialSet.length - 1) {
				currentTutorialStep++;
				updateTutorialUI();
			} else {
				endTutorial();
			}
		};
	}
}

export function advanceTutorial() {
	if (currentTutorialStep < activeTutorialSet.length - 1) {
		currentTutorialStep++;
		updateTutorialUI();
	}
}

export function endTutorial() {
	tutorialOverlay.style.display = "none";
	tutorialActive = false;
	setCookie(activeTutorialKey, "true");
}

export function startTutorial(set, key) {
	activeTutorialSet = set;
	activeTutorialKey = key;
	currentTutorialStep = 0;
	tutorialActive = true;
	updateTutorialUI();
	tutorialOverlay.style.display = "flex";
}

document.getElementById("tutorial-skip-btn").onclick = () => {
	endTutorial();
};

tutorialPrevBtn.onclick = () => {
	if (currentTutorialStep > 0) {
		currentTutorialStep--;
		updateTutorialUI();
	}
};

export const mapUi = document.getElementById("main-ui");
export const statusText = document.getElementById("status-text");
export const setupPanel = document.getElementById("setup-panel");
export const setupOptions = document.getElementById("setup-options");
export const startBtn = document.getElementById("start-btn");
export const rebellionBtn = document.getElementById("rebellion-btn");
if (rebellionBtn) {
	rebellionBtn.style.display = "none";
}

// Setup panel resize grip
{
	const savedWidth = getCookie("mw_setup_width");
	if (savedWidth) setupPanel.style.width = `${savedWidth}px`;
	const grip = setupPanel.querySelector(".setup-resize-grip");
	if (grip) {
		let dragging = false;
		let startX = 0;
		let startWidth = 0;
		grip.addEventListener("mousedown", (e) => {
			e.preventDefault();
			dragging = true;
			startX = e.clientX;
			startWidth = setupPanel.offsetWidth;
		});
		window.addEventListener("mousemove", (e) => {
			if (!dragging) return;
			const newWidth = Math.max(
				280,
				Math.min(800, startWidth + (e.clientX - startX)),
			);
			setupPanel.style.width = `${newWidth}px`;
		});
		window.addEventListener("mouseup", () => {
			if (!dragging) return;
			dragging = false;
			setCookie("mw_setup_width", setupPanel.offsetWidth);
		});
		grip.addEventListener(
			"touchstart",
			(e) => {
				const t = e.touches[0];
				dragging = true;
				startX = t.clientX;
				startWidth = setupPanel.offsetWidth;
			},
			{ passive: true },
		);
		window.addEventListener(
			"touchmove",
			(e) => {
				if (!dragging) return;
				const t = e.touches[0];
				const newWidth = Math.max(
					280,
					Math.min(800, startWidth + (t.clientX - startX)),
				);
				setupPanel.style.width = `${newWidth}px`;
			},
			{ passive: true },
		);
		window.addEventListener("touchend", () => {
			if (!dragging) return;
			dragging = false;
			setCookie("mw_setup_width", setupPanel.offsetWidth);
		});
	}
}
export const densitySlider = document.getElementById("density-slider");
export const noPeaceCheckbox = document.getElementById("no-peace-checkbox");
export const disableBombsCheckbox = document.getElementById(
	"disable-bombs-checkbox",
);
export const cityFocusCheckbox = document.getElementById("city-focus-checkbox");
export const setupDisableMountainsCheckbox = document.getElementById(
	"setup-disable-mountains-checkbox",
);
export const setupDisableProvincesCheckbox = document.getElementById(
	"setup-disable-provinces-checkbox",
);
export const disablePuppetsCheckbox = document.getElementById(
	"disable-puppets-checkbox",
);
export const mainDisableMountainsCheckbox = document.getElementById(
	"disable-mountains-checkbox",
);
export const mainDisableProvincesCheckbox = document.getElementById(
	"disable-provinces-checkbox",
);

export const casualtyPanel = document.getElementById("casualty-panel");
export const leaderboardOverlay = document.getElementById(
	"leaderboard-overlay",
);
export const leaderboardList = document.getElementById("leaderboard-list");
export const closeLeaderboardBtn = document.getElementById(
	"close-leaderboard-btn",
);

// Status & control panels
export const statsPanel = document.getElementById("stats-panel");
export const restartScenarioBtn = document.getElementById(
	"restart-scenario-btn",
);
export const quickRestartBtn = document.getElementById("quick-restart-btn");
export const resetBtn = document.getElementById("reset-btn");

// Buttons use clear text, ensure visibility is correct
if (quickRestartBtn) {
	quickRestartBtn.textContent = "QUICK RESTART";
}
if (resetBtn) {
	resetBtn.textContent = "RESET";
}
export const mainMenuBtn = document.getElementById("main-menu-btn");
export const leaderboardBtn = document.getElementById("leaderboard-btn");

export function updateRestartVisibility() {
	if (!restartScenarioBtn || !mainMenuBtn || !quickRestartBtn) return;
	const inEditorLikeMode = gameMode === "EDITOR" || godModeActive;
	const hasSnapshots = !!(
		initialWorldControlMapSnapshot && initialDeJureMapSnapshot
	);

	// Hide restart + menu + leaderboard while in editor / godmode, show them during normal scenarios
	if (inEditorLikeMode) {
		restartScenarioBtn.style.display = "none";
		quickRestartBtn.style.display = "none";
		mainMenuBtn.style.display = "none";
		if (leaderboardBtn) leaderboardBtn.style.display = "none";
	} else {
		restartScenarioBtn.style.display = "block";
		// Only show quick restart if we have the data to do it instantly
		quickRestartBtn.style.display = hasSnapshots ? "block" : "none";
		mainMenuBtn.style.display = "block";
		if (leaderboardBtn) leaderboardBtn.style.display = "block";
	}
}
export const ffBtn = document.getElementById("ff-btn");
export const pauseBtn = document.getElementById("pause-btn");
export const speedDownBtn = document.getElementById("speed-down-btn");
export const speedUpBtn = document.getElementById("speed-up-btn");
export const godModeBtn = document.getElementById("god-mode-btn");
export const godBombBtn = document.getElementById("god-bomb-btn");
export const forcePeaceBtn = document.getElementById("force-peace-btn");
export const statsGrid = document.getElementById("stats-grid");
export const tugOfWarContainer = document.getElementById(
	"tug-of-war-container",
);
export const coordsDisplay = document.getElementById("coords");
export const unitCountsDiv = document.getElementById("unit-counts");
export const unitCountsDisplay = document.getElementById("unit-counts-display");

export function rebuildStatsPanel() {
	const activeSides = sides
		.map((s, i) => ({ idx: i, countries: s }))
		.filter((x) => x.countries.length > 0);
	if (activeSides.length < 2) return;

	let gridHtml = "";
	activeSides.forEach((s, pos) => {
		const color = sideColors[s.idx].replace(rgbaRe, "1)");
		const main = s.countries[0];
		const name =
			s.countries.length > 1
				? `${main.name} +${s.countries.length - 1}`
				: main.name || `Side ${String.fromCharCode(65 + s.idx)}`;
		if (pos > 0) gridHtml += `<div class="stats-vs">VS</div>`;
		gridHtml += `<div class="side-stats" data-side-idx="${s.idx}">
            <div class="stat-name" style="color:${color};" data-sidename="${s.idx}">${name}</div>
            <div class="stat-metrics">
                <div class="metric"><span class="metric-label">PERSONNEL</span><span class="metric-value" data-sidesoldiers="${s.idx}" style="color:${color};">0</span></div>
                <div class="metric"><span class="metric-label">CITIES</span><span class="metric-value" data-sidecities="${s.idx}">0</span></div>
            </div>
        </div>`;
	});
	statsGrid.innerHTML = gridHtml;

	_cachedSoldierEls = [];
	_cachedCityEls = [];
	_cachedTerritoryCtrlEls = [];
	_cachedTerritorySegEls = [];
	for (const s of activeSides) {
		_cachedSoldierEls[s.idx] = document.querySelector(
			`[data-sidesoldiers="${s.idx}"]`,
		);
		_cachedCityEls[s.idx] = document.querySelector(
			`[data-sidecities="${s.idx}"]`,
		);
		_cachedTerritoryCtrlEls[s.idx] = document.querySelector(
			`[data-sidecontrol="${s.idx}"]`,
		);
		_cachedTerritorySegEls[s.idx] = document.querySelector(
			`[data-tugsegment="${s.idx}"]`,
		);
	}

	if (unitCountsDisplay) {
		unitCountsDisplay.innerHTML = "";
		const spans = [];
		for (let i = 0; i < sides.length; i++) {
			if (i > 0) {
				const vs = document.createElement("span");
				vs.style.color = "#888";
				vs.textContent = " vs ";
				unitCountsDisplay.appendChild(vs);
			}
			const span = document.createElement("span");
			span.style.color = sideColors[i].replace(rgbaRe, "1)");
			span.textContent = "0";
			unitCountsDisplay.appendChild(span);
			spans[i] = span;
		}
		_cachedUnitCountSpans = spans;
	}

	let tugHtml = '<div class="tug-bar">';
	activeSides.forEach((s) => {
		const color = sideColors[s.idx].replace(rgbaRe, "0.85)");
		tugHtml += `<div class="tug-segment" data-tugsegment="${s.idx}" style="background:${color};width:${Math.floor(100 / activeSides.length)}%;"></div>`;
	});
	tugHtml += '</div><div class="tug-labels">';
	activeSides.forEach((s) => {
		const color = sideColors[s.idx].replace(rgbaRe, "1)");
		tugHtml += `<span class="control-pct" data-sidecontrol="${s.idx}" style="color:${color};">${Math.floor(100 / activeSides.length)}%</span>`;
	});
	tugHtml += "</div>";
	tugOfWarContainer.innerHTML = tugHtml;
}
export const treatyAlert = document.getElementById("treaty-alert");

export function rebuildManpowerInputs() {
	const container = document.getElementById("manpower-inputs-container");
	if (!container) return;
	let html = "";
	for (let i = 0; i < sides.length; i++) {
		const color = sideColors[i].replace(rgbaRe, "1)");
		const label = `Side ${String.fromCharCode(65 + i)}`;
		html += `<div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:9px; color:${color}; text-transform:uppercase; letter-spacing:0.5px;">${label}</span>
            <input id="manpower-side-${i}" type="number" min="0" placeholder="auto" style="width:110px; padding:4px 6px; background:#2a2a30; border:1px solid #444; border-radius:4px; color:#fff; font-size:11px;" title="Total soldiers for ${label}.">
        </div>`;
	}
	container.innerHTML = html;
}
rebuildManpowerInputs();
export const treatyMsg = document.getElementById("treaty-msg");
export const timeSystemCheckbox = document.getElementById(
	"enable-time-checkbox",
);
export const timeYearInput = document.getElementById("time-year-input");
export const timeMonthInput = document.getElementById("time-month-input");
export const timeDayInput = document.getElementById("time-day-input");
export const gameDateDisplay = document.getElementById("game-date-display");

/**
 * INITIALIZATION
 */
export const map = L.map("map", {
	zoomControl: false,
	center: [20, 0],
	zoom: 3,
	minZoom: 2,
	maxZoom: 12,
	worldCopyJump: true,
	dragging: true,
	// Use viscosity so panning against the world-size box feels smooth instead of snapping back
	maxBoundsViscosity: 1.0,
	zoomSnap: 0.25,
	wheelPxPerZoomLevel: 120,
});

// Create Web Worker for async frontline BFS rebuilds
_simWorker = new Worker("../workers/simulation-worker.js");
_simWorker.onmessage = (evt) => {
	_workerBusy = false;
	const {
		frontlineDirLat: latBuf,
		frontlineDirLng: lngBuf,
		sourceCell: srcBuf,
	} = evt.data;
	frontlineDirLat = new Float32Array(latBuf);
	frontlineDirLng = new Float32Array(lngBuf);
	_frontlineSourceCell = new Int32Array(srcBuf);
};

export let baseImageryLayer = null;
export const imagerySelect = document.getElementById("imagery-select");

export function setImageryProvider(provider, persist = true) {
	if (!provider || provider === "undefined") provider = "arcgis";

	if (baseImageryLayer) {
		map.removeLayer(baseImageryLayer);
		baseImageryLayer = null;
	}

	if (provider === "arcgis") {
		baseImageryLayer = L.tileLayer(
			"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
			{
				maxZoom: 19,
				attribution: "Tiles &copy; Esri",
				crossOrigin: "anonymous",
			},
		);
		baseImageryLayer.addTo(map);
	} else if (provider === "google") {
		baseImageryLayer = L.tileLayer(
			"https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
			{
				opacity: 0.9,
				maxZoom: 19,
				attribution: "&copy; Google",
				crossOrigin: "anonymous",
			},
		);
		baseImageryLayer.addTo(map);
	} else if (provider === "google_cartoon") {
		baseImageryLayer = L.tileLayer(
			"https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
			{
				opacity: 1.0,
				maxZoom: 19,
				attribution: "&copy; Google",
				crossOrigin: "anonymous",
			},
		);
		baseImageryLayer.addTo(map);
	}
	// 'wargames' / simplified mode has no tile layer, so baseImageryLayer stays null.

	if (persist) {
		setCookie("mw_imagery", provider);
	}

	if (imagerySelect) imagerySelect.value = provider;

	const c = map.getContainer();
	if (c) c.style.background = "#000";

	if (influenceLayer) {
		influenceLayer._forceRender = true;
		if (typeof influenceLayer._update === "function") influenceLayer._update();
	}
}

/*
 * Initialize imagery style based on saved preference.
 */
setImageryProvider(getCookie("mw_imagery") || "arcgis");

if (imagerySelect) {
	imagerySelect.addEventListener("change", (e) => {
		setImageryProvider(e.target.value);
	});
}

import {
	applyPaintAt,
	fillTerrainAt,
	generatePresetData,
	importSingleCountryFromScenario,
	loadCountries,
	loadScenarioForCountryImportFromBlob,
	loadScenarioForCountryImportFromUrl,
	loadTerrain,
	paintAt,
	performPresetLoad,
	updateCountryFlag,
	updateEditorToolPage,
	updateLandMask,
} from "./editor.js";
import {
	clearCellInfluence,
	computeFrontlinePolys,
	getBorderDirection,
	getGridIndex,
	initSideInfluenceMaps,
	isEnemyTerritory,
	isMyTerritory,
	myInfluenceAt,
	rebuildFrontlineField,
	resetSideInfluenceMaps,
	syncOccupationFromSideInfluence,
} from "./engine.js";
import {
	closeHub,
	openHub,
	renderHub,
	selectScenario,
	switchHubTab,
} from "./firebase.js";
import { ControlMapLayer } from "./renderer.js";

export { getGridIndex, resetSideInfluenceMaps };

influenceLayer = new ControlMapLayer().addTo(map);

// Create dedicated pane for reference images to ensure they stay behind the control map but above base imagery
map.createPane("refImagePane");
map.getPane("refImagePane").style.zIndex = 350;

/**
 * PERSISTENT GRID LOGIC
 */

/**
 * Completely remade province generation using multi-octave cellular noising.
 * Generates an organic, non-repeating province ID that is strictly unique to a specific sovereign country.
 */
export function getProvinceId(x, y, countryId) {
	if (countryId <= 0) return 0;
	const res = CONFIG.GRID_RES;
	const lat = y * res - 90;
	const lng = x * res - 180;

	// Base coordinates scaled for province density
	const scale = 0.65;
	const nx = lng * scale;
	const ny = lat * scale;

	// Octave 1: Domain warping
	const w1 = Math.sin(nx * 0.8 + ny * 0.6 + countryId * 0.1) * 1.2;
	const w2 = Math.cos(nx * 0.5 - ny * 0.9 + countryId * 0.2) * 1.1;

	// Octave 2: High-frequency fractal noise composition
	const noise =
		Math.sin((nx + w1) * 2.3) * 0.5 +
		Math.sin((ny + w2) * 1.9) * 0.5 +
		Math.sin((nx + ny) * 1.4 + countryId) * 0.3 +
		Math.cos(nx * 3.1 - ny * 2.7) * 0.2;

	// Grid snap into "cells"
	const cellX = Math.floor(nx + w1 + noise);
	const cellY = Math.floor(ny + w2 + noise);

	// Unique hashing using prime pairing to ensure no two provinces share an ID, even across countries.
	// The countryId is a primary component of the hash, forcing province lines to reset at borders.
	const h1 = Math.abs(cellX * 73856093);
	const h2 = Math.abs(cellY * 19349663);
	const h3 = Math.abs(countryId * 83492791);

	return (h1 ^ h2 ^ h3) >>> 0;
}

export function generateProvinces() {
	if (!provinceMap || !worldControlMap) return;
	for (let y = 0; y < gridHeight; y++) {
		const rowOffset = y * gridWidth;
		for (let x = 0; x < gridWidth; x++) {
			const idx = rowOffset + x;
			provinceMap[idx] = getProvinceId(x, y, worldControlMap[idx]);
		}
	}
}

export function applyWorldBounds(
	widthDeg,
	heightDeg,
	allowImagerySwitch = true,
) {
	// Clamp to safe ranges
	const w = Math.max(10, Math.min(360, widthDeg || 360));
	const h = Math.max(10, Math.min(180, heightDeg || 180));
	worldWidthDeg = w;
	worldHeightDeg = h;

	// If changing size while not in Simplified mode, force switch to Simplified (wargames)
	if (
		allowImagerySwitch &&
		imagerySelect &&
		imagerySelect.value !== "wargames"
	) {
		setImageryProvider("wargames", false);
		if (disableCountryGradientCheckbox) {
			disableCountryGradientCheckbox.checked = true;
			disableCountryGradient = true;
		}
	}

	const halfW = w / 2;
	const halfH = h / 2;
	const bounds = L.latLngBounds(
		L.latLng(-halfH, -halfW),
		L.latLng(halfH, halfW),
	);
	map.setMaxBounds(bounds);

	// If current center is outside new bounds, fit map into the new box
	if (!bounds.contains(map.getCenter())) {
		map.fitBounds(bounds, { animate: true });
	}

	// Force bounding box redraw
	if (influenceLayer) {
		influenceLayer._forceRender = true;
		if (typeof influenceLayer._update === "function") {
			influenceLayer._update();
		} else {
			influenceLayer.render();
		}
	}
}

export function isInsideWorldBoxLatLng(lat, lng) {
	if (!worldWidthDeg || !worldHeightDeg) return true;
	const halfW = worldWidthDeg / 2;
	const halfH = worldHeightDeg / 2;
	return lat >= -halfH && lat <= halfH && lng >= -halfW && lng <= halfW;
}

export function getAllianceRootId(startId) {
	if (!startId || startId <= 0 || !countryMetadata) return null;
	const visited = new Set();
	const queue = [startId];
	let rootId = startId;
	while (queue.length) {
		const cid = queue.shift();
		if (visited.has(cid)) continue;
		visited.add(cid);
		if (cid < rootId) rootId = cid;
		const meta = countryMetadata[cid - 1];
		const allies = meta && Array.isArray(meta.allies) ? meta.allies : [];
		allies.forEach((aid) => {
			if (aid > 0 && !visited.has(aid)) queue.push(aid);
		});
	}
	return rootId;
}

/**
 * Returns all member country IDs in the same alliance graph as the given startId,
 * including the startId itself.
 */
export function getAllianceMembers(startId) {
	if (!startId || startId <= 0 || !countryMetadata) return [];
	const visited = new Set();
	const queue = [startId];
	while (queue.length) {
		const cid = queue.shift();
		if (visited.has(cid)) continue;
		visited.add(cid);
		const meta = countryMetadata[cid - 1];
		const allies = meta && Array.isArray(meta.allies) ? meta.allies : [];
		allies.forEach((aid) => {
			if (aid > 0 && !visited.has(aid)) queue.push(aid);
		});
	}
	return Array.from(visited);
}

export function recalculateAllBounds(forceFullScan = false) {
	if (!countryMetadata || !worldControlMap) return;
	const isWar =
		gameState === "SIMULATING" ||
		(godModeActive && preGodModeState === "SIMULATING");

	// Performance optimization: when zoomed in deep, we only scan a slightly larger padding of the view
	// to update labels, rather than the entire 6.4 million cell world grid.
	// However, for critical systems like defining a war theater, we MUST scan the full world.
	const view = map.getBounds();
	const res = CONFIG.GRID_RES;

	let vXMin = 0,
		vXMax = gridWidth - 1,
		vYMin = 0,
		vYMax = gridHeight - 1;

	if (!forceFullScan) {
		vXMin = Math.max(0, Math.floor((view.getWest() + 180) / res) - 10);
		vXMax = Math.min(
			gridWidth - 1,
			Math.ceil((view.getEast() + 180) / res) + 10,
		);
		vYMin = Math.max(0, Math.floor((view.getSouth() + 90) / res) - 10);
		vYMax = Math.min(
			gridHeight - 1,
			Math.ceil((view.getNorth() + 90) / res) + 10,
		);
	}

	countryMetadata.forEach((meta) => {
		if (!meta) return;
		// Store last bounds for stable binning
		meta.prevBounds = meta.bounds ? { ...meta.bounds } : null;
		meta.bounds = {
			minX: Infinity,
			maxX: -Infinity,
			minY: Infinity,
			maxY: -Infinity,
		};
		meta.labelBins = Array.from({ length: 4 }, () => ({
			latSum: 0,
			lngSum: 0,
			count: 0,
		}));
		meta.totalLatSum = 0;
		meta.totalLngSum = 0;
		meta.totalCount = 0;
	});

	// Scan viewport only for label updates to drastically reduce CPU pressure
	for (let y = vYMin; y <= vYMax; y++) {
		const rowOffset = y * gridWidth;
		const lat = y * res - 90;
		for (let x = vXMin; x <= vXMax; x++) {
			const i = rowOffset + x;
			const lng = x * res - 180;
			let id = worldControlMap[i];

			if (isWar && landMask[i] === 2) {
				const occ = occupationMap[i];
				if (Math.abs(occ) > 0.05) {
					const occupierId = primaryOccupierMap[i];
					if (occupierId > 0) id = occupierId;
				}
			}

			if (id > 0 && id <= countryMetadata.length) {
				const meta = countryMetadata[id - 1];
				if (meta) {
					const b = meta.bounds;
					if (x < b.minX) b.minX = x;
					if (x > b.maxX) b.maxX = x;
					if (y < b.minY) b.minY = y;
					if (y > b.maxY) b.maxY = y;

					// Stable Label Data Accumulation
					meta.totalLatSum += lat;
					meta.totalLngSum += lng;
					meta.totalCount++;

					// Use prev bounds to determine stable binning during this pass
					if (meta.prevBounds && meta.prevBounds.minX !== Infinity) {
						const width = Math.max(
							1,
							meta.prevBounds.maxX - meta.prevBounds.minX,
						);
						const binIdx = Math.max(
							0,
							Math.min(3, Math.floor(((x - meta.prevBounds.minX) / width) * 4)),
						);
						const bin = meta.labelBins[binIdx];
						bin.latSum += lat;
						bin.lngSum += lng;
						bin.count++;
					}
				}
			}
		}
	}

	// Finalize stable centers
	countryMetadata.forEach((meta) => {
		if (meta && meta.totalCount > 0) {
			meta.stableCenter = {
				lat: meta.totalLatSum / meta.totalCount,
				lng: meta.totalLngSum / meta.totalCount,
			};
			// If prev bounds weren't available, the bins will be empty; Pass 7 will handle fallback
		}
	});
}

export function getCountryColor(feature, alpha = 1) {
	if (!feature) return `rgba(150, 150, 150, ${alpha})`;
	const name =
		feature.properties.NAME ||
		feature.properties.name ||
		feature.properties.admin ||
		feature.properties.NAME_LONG ||
		"Unknown";

	// Check for predefined HOI4 colors
	if (CONFIG.HOI4_COLORS[name]) {
		const hex = CONFIG.HOI4_COLORS[name];
		// Convert hex to rgba
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	// Fallback to deterministic hash-based HSL
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}
	const h = Math.abs(hash % 360);
	const s = 60 + Math.abs((hash >> 8) % 30); // 60-90%
	const l = 45 + Math.abs((hash >> 16) % 20); // 45-65%
	return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}

export function getControlValue(lat, lng) {
	const idx = getGridIndex(lat, lng);
	if (idx === -1 || landMask[idx] === 0) return 0;
	// For combat logic, return occupation if in active warzone
	if (gameState === "SIMULATING" && landMask[idx] === 2)
		return occupationMap[idx];
	return 0;
}

export function estimateUnitsForCountry(countryId) {
	if (!worldControlMap?.length || !countryId) return 0;

	// Count how many grid cells this country controls on the current map
	let cellCount = 0;
	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === countryId) cellCount++;
	}
	if (cellCount === 0) return 0;

	const multiplier = parseFloat(densitySlider.value) || 1.0;
	const sizeFactor = Math.max(1, cellCount / 1500);
	const densityScale = 1.0 / sizeFactor ** 0.45;

	let count = Math.floor(
		cellCount * CONFIG.UNIT_DENSITY_FACTOR * multiplier * densityScale,
	);
	const flatFloor = 3;
	count = Math.max(flatFloor, Math.min(count, CONFIG.MAX_UNITS_PER_SIDE));

	return count * CONFIG.UNIT_TO_SOLDIER_RATIO;
}

export function updateSidesUI() {
	sidesContainer.innerHTML = "";

	sides.forEach((sideList, sideIdx) => {
		const sideCol = document.createElement("div");
		sideCol.className = "side-col";

		// Compute total estimated troops for this side/front
		const sideTotalTroops = sideList.reduce((sum, country) => {
			const est = estimateUnitsForCountry(country.id);
			return sum + (est || 0);
		}, 0);

		const sideHeader = document.createElement("div");
		sideHeader.className = `side-header ${activeSideIndex === sideIdx ? "active" : ""}`;
		sideHeader.dataset.side = sideIdx;

		// Use A, B, C, D labels
		const sideLabel = String.fromCharCode(65 + sideIdx);
		if (sideList.length > 0 && sideTotalTroops > 0) {
			sideHeader.innerHTML = `
                <div style="font-size:11px; font-weight:900;">SIDE ${sideLabel}</div>
                <div style="font-size:9px; color:#777; margin-top:2px; text-transform:uppercase; letter-spacing:0.5px;">
                    ~ ${influenceLayer.formatSoldiers(sideTotalTroops)} troops
                </div>
            `;
		} else {
			sideHeader.innerText = `SIDE ${sideLabel}`;
		}
		sideHeader.style.color = sideColors[sideIdx].replace(rgbaRe, "0.6)");
		if (activeSideIndex === sideIdx) {
			sideHeader.style.backgroundColor = sideColors[sideIdx].replace(
				/[\d.]+\)$/g,
				"0.2)",
			);
			sideHeader.style.borderColor = sideColors[sideIdx].replace(
				/[\d.]+\)$/g,
				"1)",
			);
		}

		sideHeader.onclick = () => {
			activeSideIndex = sideIdx;
			rebuildManpowerInputs();
			updateSidesUI();
		};

		const listContainer = document.createElement("div");
		listContainer.className = "side-country-list";

		sideList.forEach((country, i) => {
			const meta = countryMetadata.find((m) => m && m.id === country.id);
			const slot = document.createElement("div");
			slot.className = "setup-slot";
			slot.style.borderColor = sideColors[sideIdx].replace(rgbaRe, "0.4)");
			slot.style.borderColor = country.color.replace(rgbaRe, "1)");

			const buffState = country.buffState || meta?.buffState || "none";
			const bMeta = BUFF_METADATA[buffState] || BUFF_METADATA.none;
			const hiddenBuffState =
				(country.hiddenBuffState !== undefined
					? country.hiddenBuffState
					: (meta?.hiddenBuffState ?? "none")) || "none";
			const _hiddenMeta = BUFF_METADATA[hiddenBuffState] || BUFF_METADATA.none;

			// Find flag for setup UI from live object or metadata
			const flagUrl = country.flag?.src || meta?.flagUrl || "";

			// Estimated troop size based on current density slider and map ownership
			const estTroops = estimateUnitsForCountry(country.id);
			const estLabel = estTroops
				? influenceLayer.formatSoldiers(estTroops)
				: "UNKNOWN";

			const releasables = countryMetadata.filter(
				(m) => m && m.releasableBy === country.id,
			);

			const displayName = getTranslation(
				country.name,
				getCookie("mw_lang") || "en",
				"NATIONS",
			);
			slot.innerHTML = `
                <div class="slot-name" title="${country.name}" style="display: flex; flex-direction: column; gap: 2px; align-items: center; justify-content: center; margin-bottom: 5px;">
                    <div style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                        ${flagUrl ? `<img src="${flagUrl}" style="width: 22px; height: 13px; object-fit: cover; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0; border-radius: 1px;">` : ""}
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</span>
                    </div>
                    <div style="font-size: 9px; color: #777; text-transform: uppercase; letter-spacing: 0.5px;">~ ${estLabel} troops</div>
                    <button class="mini-btn buff-toggle-btn" style="margin-top: 4px; background:${bMeta.color}; color:${bMeta.textColor}; font-size:8px; padding:2px 6px; display:flex; align-items:center; gap:4px; justify-content:center;" title="Adjust combat buffs: use ◀ / ▶ to move between CRIPPLED, WEAKENED, NONE, GOLIATH, DEITY, GODLY. Hold ALT while clicking to change an invisible buff that only affects combat.">
                        <span class="buff-arrow" data-dir="-1" style="font-size:10px;">◀</span>
                        <span class="buff-label">BUFF: ${bMeta.label}</span>
                        <span class="buff-arrow" data-dir="1" style="font-size:10px;">▶</span>
                    </button>
                    <button class="mini-btn add-allies-btn" style="margin-top: 4px; background:#16a085; font-size: 8px; padding: 2px 6px;" title="Recruit all formal allies (overlord and vassals) of this nation into this side.">ADD ALLIES</button>
                    
                    ${releasables.length > 0 ? `<button class="mini-btn release-btn" style="background: #27ae60; font-size: 8px; padding: 2px 6px; margin-top: 4px;" title="Release a releasable core from this country into the war.">RELEASE...</button>` : ""}
                </div>
                <div class="slot-controls">
                    <select class="mini-select role-select" title="OFF: Leads attacks and creates new fronts. SUP: Sends expeditionary support to allied offensives instead of opening its own invasions.">
                        <option value="OFFENSE" ${country.role === "OFFENSE" ? "selected" : ""} title="OFF: Offensive main participant, pushes its own fronts.">OFF</option>
                        <option value="SUPPORT" ${country.role === "SUPPORT" ? "selected" : ""} title="SUP: Support nation; mostly sends troops to help allies instead of starting new invasions.">SUP</option>
                    </select>
                    <select class="mini-select strategy-select" title="Per-country behavior: BAL = mixed; AGG = push hard; DEF = hold cores; BLZ = fast spearheads; URB = city road wars.">
                        <option value="BALANCED" ${country.strategy === "BALANCED" ? "selected" : ""} title="BAL: Balanced offense and defense along the whole front.">BAL</option>
                        <option value="AGGRESSIVE" ${country.strategy === "AGGRESSIVE" ? "selected" : ""} title="AGG: Very aggressive, tries to push hard even when risky.">AGG</option>
                        <option value="DEFENSIVE" ${country.strategy === "DEFENSIVE" ? "selected" : ""} title="DEF: Focuses on defending own cores and reclaiming lost land.">DEF</option>
                        <option value="BLITZ" ${country.strategy === "BLITZ" ? "selected" : ""} title="BLZ: Blitz-style spearheads that seek breakthroughs and deep pushes.">BLZ</option>
                        <option value="URBAN" ${country.strategy === "URBAN" ? "selected" : ""} title="URB: Urban warfare; pushes along roads into cities in thin invasion lines.">URB</option>
                    </select>
                    <button class="clear-slot-btn" title="Remove this country from the selected side.">×</button>
                </div>
            `;

			const buffBtn = slot.querySelector(".buff-toggle-btn");
			if (buffBtn) {
				const buffLabelEl = buffBtn.querySelector(".buff-label");
				const buffArrows = buffBtn.querySelectorAll(".buff-arrow");

				const applyBuffState = (newState) => {
					country.buffState = newState;
					if (meta) meta.buffState = newState;
					const metaBuff = BUFF_METADATA[newState] || BUFF_METADATA.none;
					if (buffLabelEl) buffLabelEl.textContent = `BUFF: ${metaBuff.label}`;
					buffBtn.style.background = metaBuff.color;
					buffBtn.style.color = metaBuff.textColor;
				};

				buffArrows.forEach((span) => {
					span.addEventListener("click", (e) => {
						e.stopPropagation();
						const dir = parseInt(span.getAttribute("data-dir"), 10) || 1;
						const current = country.buffState || "none";
						const nextState = cycleBuffState(current, dir);
						applyBuffState(nextState);
					});
				});

				// Clicking the center label still cycles forward for convenience
				if (buffLabelEl) {
					buffLabelEl.addEventListener("click", (e) => {
						e.stopPropagation();
						const current = country.buffState || "none";
						const nextState = cycleBuffState(current, 1);
						applyBuffState(nextState);
					});
				}
			}

			// "Add Allies" button: pull overlord + vassals into this side when available
			const addAlliesBtn = slot.querySelector(".add-allies-btn");
			if (addAlliesBtn) {
				addAlliesBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					const thisMeta = countryMetadata.find(
						(m) => m && m.id === country.id,
					);
					if (!thisMeta) return;

					const alliesSet = new Set();
					// 1) This country itself
					alliesSet.add(country.id);

					// 2) Its overlord chain root
					let rootId = country.id;
					let guard = 0;
					while (guard < 16) {
						const rootMeta = countryMetadata[rootId - 1];
						if (!rootMeta?.overlordId || rootMeta.overlordId === rootId) break;
						rootId = rootMeta.overlordId;
						guard++;
					}
					alliesSet.add(rootId);

					// 3) Direct vassals of this country
					countryMetadata.forEach((m) => {
						if (m && m.overlordId === country.id) {
							alliesSet.add(m.id);
						}
					});

					// 4) Direct vassals of the root (same wider alliance)
					countryMetadata.forEach((m) => {
						if (m && m.overlordId === rootId) {
							alliesSet.add(m.id);
						}
					});

					// 5) Explicit allies defined in the editor (mutual alliance graph)
					const explicitAllies = Array.isArray(thisMeta.allies)
						? thisMeta.allies
						: [];
					explicitAllies.forEach((aid) => {
						if (aid > 0) alliesSet.add(aid);
					});

					// Remove ids that don't exist in metadata
					const validAllies = Array.from(alliesSet).filter(
						(id) => countryMetadata[id - 1],
					);

					if (validAllies.length <= 1) {
						statusText.innerText =
							"No allies linked via overlord/vassal or editor alliances for this nation.";
						return;
					}

					// Add all valid allies to this side if not already present anywhere
					const alreadyInAnySide = new Set(
						sides
							.flat()
							.filter(Boolean)
							.map((c) => c.id),
					);
					let addedCount = 0;
					validAllies.forEach((id) => {
						if (alreadyInAnySide.has(id)) return;
						const m = countryMetadata[id - 1];
						if (!m) return;
						sides[sideIdx].push({
							id: m.id,
							name: m.name,
							color: m.color,
							role: "OFFENSE",
							strategy: "BALANCED",
							buffState: m.buffState || "none",
							overlordId: m.overlordId || null,
							flag: m.tempFlag || null,
						});
						alreadyInAnySide.add(id);
						addedCount++;
					});

					if (addedCount > 0) {
						statusText.innerText = `Alliance Mobilized: Added ${addedCount} allied member${addedCount === 1 ? "" : "s"} to Side ${String.fromCharCode(65 + sideIdx)}.`;
						updateSidesUI();
						influenceLayer.render();
					} else {
						statusText.innerText =
							"All linked allies are already committed to a side.";
					}
				});
			}

			slot.querySelector(".role-select").onchange = (e) => {
				country.role = e.target.value;
			};

			slot.querySelector(".strategy-select").onchange = (e) => {
				country.strategy = e.target.value;
			};

			slot.querySelector(".clear-slot-btn").onclick = (e) => {
				e.stopPropagation();
				sideList.splice(i, 1);
				updateSidesUI();
				influenceLayer.render();
			};

			const releaseBtn = slot.querySelector(".release-btn");
			if (releaseBtn) {
				releaseBtn.onclick = (e) => {
					e.stopPropagation();
					openReleaseModal(country.id, sideIdx);
				};
			}

			listContainer.appendChild(slot);
		});

		sideCol.appendChild(sideHeader);

		// Add "Delete Side" button for sides beyond the first two
		if (sides.length > 2) {
			const delBtn = document.createElement("button");
			delBtn.className = "mini-btn";
			delBtn.innerText = "Remove Side";
			delBtn.style.fontSize = "8px";
			delBtn.style.padding = "2px";
			delBtn.onclick = (e) => {
				e.stopPropagation();
				sides.splice(sideIdx, 1);
				if (activeSideIndex >= sides.length) activeSideIndex = sides.length - 1;
				rebuildManpowerInputs();
				updateSidesUI();
			};
			sideCol.appendChild(delBtn);
		}

		sideCol.appendChild(listContainer);
		sidesContainer.appendChild(sideCol);

		if (sideIdx < sides.length - 1) {
			const divider = document.createElement("div");
			divider.className = "vs-divider";
			divider.innerText = "VS";
			divider.style.alignSelf = "center";
			sidesContainer.appendChild(divider);
		}
	});

	const activeSidesCount = sides.filter((s) => s && s.length > 0).length;
	const _allSelectedCountries = sides.flat().filter((c) => !!c);

	// Rebellions are disabled: ensure button (if present) stays hidden and inert.
	if (rebellionBtn) {
		rebellionBtn.style.display = "none";
		rebellionBtn.disabled = true;
	}

	setupOptions.style.display = activeSidesCount >= 1 ? "block" : "none";
	const canStart = activeSidesCount >= 2;
	startBtn.disabled = !canStart;
	startBtn.style.opacity = canStart ? "1" : "0.5";
	startBtn.style.cursor = canStart ? "pointer" : "not-allowed";

	const _attackers = sides[0] || [];
	const _defenders = sides[1] || [];

	rebuildManpowerInputs();
	rebuildStatsPanel();
}

addSideBtn.onclick = () => {
	if (sides.length >= MAX_SIDES) {
		alert(`Maximum ${MAX_SIDES} sides supported.`);
		return;
	}
	sides.push([]);
	activeSideIndex = sides.length - 1;
	rebuildManpowerInputs();
	updateSidesUI();
};

ffaToggleBtn.onclick = () => {
	ffaMode = !ffaMode;
	ffaToggleBtn.style.border = ffaMode ? "2px solid #fff" : "none";
	ffaToggleBtn.innerText = ffaMode ? "FFA: ON" : "FFA Mode";
	if (ffaMode) {
		const allCountries = sides.flat();
		sides = allCountries.map((c) => [c]);
		if (sides.length < 2) sides = [[], []];
		if (sides.length > MAX_SIDES) sides = sides.slice(0, MAX_SIDES);
		activeSideIndex = 0;
	} else {
		const allCountries = sides.flat();
		sides = [[], []];
		allCountries.forEach((c, i) => {
			sides[i % 2].push(c);
		});
	}
	updateSidesUI();
};

export const randomWarBtn = document.getElementById("random-war-btn");
randomWarBtn.onclick = () => {
	randomWarMode = !randomWarMode;
	randomWarBtn.innerText = randomWarMode ? "Random War: ON" : "Random War: OFF";
	randomWarBtn.style.background = randomWarMode ? "#8e44ad" : "#9b59b6";

	if (
		randomWarMode &&
		(gameState === "SELECTING_P1" || gameState === "SELECTING_P2")
	) {
		triggerRandomWar();
	}
};

export function updatePersistentInfluence(p1Count, p2Count, countryToSideMap) {
	let baseInfluence = CONFIG.INFLUENCE_RATE;

	// Dynamic optimization: More sides => fewer expensive samples / unit updates
	const optimizationFactor = getOptimizationFactor();

	// Mobilization Ramp: Influence starts at 5% and climbs to 100% over 600 frames (~10 seconds)
	const rampDuration = 600;
	const rampScale = Math.min(1.0, 0.05 + (simFrameCount / rampDuration) * 0.95);
	baseInfluence *= rampScale;

	// Boost expansion when unopposed
	if (p1Count > 0 && p2Count === 0) baseInfluence *= 6;
	if (p2Count > 0 && p1Count === 0) baseInfluence *= 6;

	// Optimization: Interleave unit influence updates to prevent frame spikes
	// Each unit only updates its influence 1 in 3 ticks.
	const frameStride = 3;
	const _currentTickOffset = simFrameCount % frameStride;

	// Territory Diffusion Pass: Spread occupation laterally to prevent thin "fingers" and jagged borders.
	// Throttled: only runs every 3 ticks (was every tick at 35K samples — ~15-20% CPU at 5x).
	if (simFrameCount % 3 === 0) {
		const smoothingBase = 8000;
		const smoothingSamples = Math.max(
			2000,
			Math.floor(smoothingBase / optimizationFactor),
		);
		for (let s = 0; s < smoothingSamples; s++) {
			const idx = Math.floor(Math.random() * landMask.length);
			if (landMask[idx] !== 2) continue;

			const y = Math.floor(idx / gridWidth);
			const x = idx % gridWidth;
			if (x <= 0 || x >= gridWidth - 1 || y <= 0 || y >= gridHeight - 1)
				continue;

			const blur = 0.25;
			for (let si = 0; si < sideInfluenceMaps.length; si++) {
				let sum = 0;
				let count = 0;
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						const nIdx = idx + dy * gridWidth + dx;
						if (nIdx >= 0 && nIdx < sideInfluenceMaps[si].length) {
							sum += sideInfluenceMaps[si][nIdx];
							count++;
						}
					}
				}
				sideInfluenceMaps[si][idx] =
					sideInfluenceMaps[si][idx] * (1 - blur) + (sum / count) * blur;
			}
			syncOccupationFromSideInfluence(idx);
		}
	}

	// Strategic Batching: Process a fixed max number of units per frame for influence
	// This prevents framerate drops when unit counts explode (e.g. 1000+ units)
	const maxUnitsBase = 300;
	const maxUnitsToProcess = Math.max(
		50,
		Math.floor(maxUnitsBase / optimizationFactor),
	);
	let unitsProcessed = 0;

	// Start index rotates through the unit list
	const startIndex = (simFrameCount * 30) % Math.max(1, units.length);

	// OPT: Pre-compute city grid indices as a Set once per tick, not per-cell inside the loop.
	// Previously: activeTheaterCities.some(c => getGridIndex(c.lat, c.lng) === idx) ran inside
	// a triple-nested loop (units × cells × cities), causing millions of getGridIndex calls/tick.
	_tickCityGridIndexSet.clear();
	const cityGridIndexSet = _tickCityGridIndexSet;
	const citySource = activeTheaterCities?.length ? activeTheaterCities : [];
	for (let ci = 0; ci < citySource.length; ci++) {
		const gi = getGridIndex(citySource[ci].lat, citySource[ci].lng);
		if (gi !== -1) cityGridIndexSet.add(gi);
	}

	// OPT: Pre-compute per-side ally id Sets so isOwnerAlly is an O(1) Set lookup, not .some()
	while (_tickSideAllyIdSets.length < sides.length)
		_tickSideAllyIdSets.push(new Set());
	while (_tickSideSupportIdSets.length < sides.length)
		_tickSideSupportIdSets.push(new Set());
	for (let si = 0; si < sides.length; si++) {
		_tickSideAllyIdSets[si].clear();
		sides[si].forEach((c) => {
			_tickSideAllyIdSets[si].add(c.id);
		});
		_tickSideSupportIdSets[si].clear();
		sides[si].forEach((c) => {
			if (c.role === "SUPPORT") _tickSideSupportIdSets[si].add(c.id);
		});
	}
	const sideAllyIdSets = _tickSideAllyIdSets;
	const sideSupportIdSets = _tickSideSupportIdSets;

	for (let i = 0; i < units.length; i++) {
		const idx = (startIndex + i) % units.length;
		const u = units[idx];
		if (u.deployTicks > 0) continue;

		// If this unit is currently in active combat, it should not exert territorial influence
		if (
			typeof u.lastCombatTick === "number" &&
			simFrameCount - u.lastCombatTick <= 5
		) {
			continue;
		}

		unitsProcessed++;
		if (unitsProcessed > maxUnitsToProcess) break;

		if (u.deployTicks > 0) continue;
		let r = CONFIG.INFLUENCE_RADIUS;
		let teamMult = 1.0;

		const gridIdx = getGridIndex(u.lat, u.lng);
		const isAtSea = gridIdx === -1 || landMask[gridIdx] === 0;
		const mountainIntensity =
			mountainsEnabled && gridIdx !== -1 ? terrainMask[gridIdx] : 0;

		// Naval units exert less influence on territory capture than land units
		if (isAtSea) teamMult *= 0.4;

		if (mountainIntensity > 0) {
			// Nerf advancement size (radius) and expansion rate (influence power) in mountains
			// Higher intensity mountains require units to be significantly closer to the border to flip it
			r *= 1.0 - mountainIntensity * 0.65;
			teamMult *= 1.0 - mountainIntensity * 0.5;
		}

		const sideList = sides[u.sideIndex] || [];
		const countryObj = sideList.find((c) => c.id === u.sovereignId);
		const role = countryObj?.role || "OFFENSE";
		const _isUrbanStrategy = countryObj?.strategy === "URBAN";

		if (countryObj) {
			if (countryObj.buffState === "buff") teamMult = 2.5;
			else if (countryObj.buffState === "super") teamMult = 8.0;
			else if (countryObj.buffState === "godly") {
				teamMult = 45.0;
				r *= 0.5;
			} else if (countryObj.buffState === "weakened") teamMult = 0.7;
			else if (countryObj.buffState === "crippled") teamMult = 0.4;

			// Apply continuous attack modifier to influence strength as well
			const atkPct =
				typeof countryObj.attackBuffPercent === "number"
					? countryObj.attackBuffPercent
					: 0;
			const atkFactor = 1 + atkPct / 100;
			if (atkFactor > 0) teamMult *= atkFactor;
		}

		if (u.victoryBoostTicks > 0) {
			teamMult *= 3.0; // Buffed influence capture power
			r *= 1.4; // Increased capture radius
		}

		// Organic Push: Randomize push intensity per unit to create ragged, non-linear salients
		const organicNoise =
			0.8 + Math.sin(u.id * 1000 + simFrameCount * 0.05) * 0.4;
		const delta = baseInfluence * teamMult * organicNoise;
		const _mySide = sides[u.sideIndex];
		const mySideIdx = u.sideIndex;

		// Ragged Frontiers: Perturb the influence radius slightly to create "fingers" and "bubbles"
		const rVar = r * (0.9 + Math.sin(u.id * 500 + simFrameCount * 0.1) * 0.2);

		const startLat = Math.max(
			0,
			Math.floor((u.lat - rVar + 90) / CONFIG.GRID_RES),
		);
		const endLat = Math.min(
			gridHeight - 1,
			Math.floor((u.lat + rVar + 90) / CONFIG.GRID_RES),
		);
		const startLng = Math.max(
			0,
			Math.floor((u.lng - rVar + 180) / CONFIG.GRID_RES),
		);
		const endLng = Math.min(
			gridWidth - 1,
			Math.floor((u.lng + rVar + 180) / CONFIG.GRID_RES),
		);

		for (let y = startLat; y <= endLat; y++) {
			for (let x = startLng; x <= endLng; x++) {
				const idx = y * gridWidth + x;
				if (
					idx < 0 ||
					idx >= landMask.length ||
					landMask[idx] === 0 ||
					landMask[idx] !== 2
				)
					continue;

				// City Resistance: Cells containing cities are much harder for frontlines to pass through
				let cellDelta = delta;
				if (cityGridIndexSet.has(idx)) cellDelta *= 0.35;

				const cellLat = y * CONFIG.GRID_RES - 90;
				const cellLng = x * CONFIG.GRID_RES - 180;
				const dSq = (u.lat - cellLat) ** 2 + (u.lng - cellLng) ** 2;
				if (dSq < rVar * rVar) {
					const dist = Math.sqrt(dSq);
					// Strategic Concentration: Units push harder when clustered or in spearheads
					const concentrationBonus = Math.min(2.5, (u.lastAllyCount || 1) / 5);
					const weight = (1 - dist / rVar) ** 2.0 * concentrationBonus;

					const curInfluence = sideInfluenceMaps[mySideIdx][idx];
					let newInfluence = curInfluence + Math.abs(cellDelta) * weight;
					if (newInfluence > 1) newInfluence = 1;

					const isRebelUnit =
						activeRebellion && u.sovereignId === activeRebellion.rebelId;
					if (isRebelUnit && deJureMap[idx] !== activeRebellion.rebelId) {
						if (newInfluence > curInfluence) {
							newInfluence = curInfluence;
						}
					}

					const ownerId = worldControlMap[idx];
					const isOwnerAlly =
						sideAllyIdSets[u.sideIndex] &&
						sideAllyIdSets[u.sideIndex].has(ownerId);

					// If owner is a SUPPORT nation on the other side and we are OFFENSE, don't invade (skip influence)
					// unless we already have established some occupation in that cell.
					if (!isOwnerAlly && ownerId > 0 && role === "OFFENSE") {
						const ownerSideIdx = countryToSideMap.get(ownerId);
						if (ownerSideIdx !== undefined && ownerSideIdx !== u.sideIndex) {
							if (sideSupportIdSets[ownerSideIdx]?.has(ownerId)) {
								const curOcc = occupationMap[idx];
								const isAlreadyInvaded = Math.abs(curOcc) > 0.1;
								if (!isAlreadyInvaded) continue;
							}
						}
					}

					const currentOccupierId = primaryOccupierMap[idx];

					if (!isOwnerAlly) {
						const creditToId = u.beneficiaryId || u.sovereignId;
						const currentOccSideIdx = countryToSideMap.get(currentOccupierId);
						const isCurrentOccAlly =
							currentOccSideIdx !== undefined &&
							currentOccSideIdx === u.sideIndex;

						if (!isCurrentOccAlly) {
							const counts = new Map();
							const checkDirs = [
								[0, 1],
								[0, -1],
								[1, 0],
								[-1, 0],
								[1, 1],
								[1, -1],
								[-1, 1],
								[-1, -1],
							];
							for (const [dx, dy] of checkDirs) {
								const nx = x + dx;
								const ny = y + dy;
								if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
									const nId = primaryOccupierMap[ny * gridWidth + nx];
									const nSide = countryToSideMap.get(nId);
									if (nId > 0 && nSide !== undefined && nSide === u.sideIndex) {
										counts.set(nId, (counts.get(nId) || 0) + 1);
									}
								}
							}

							let bestAllyId = 0;
							let maxCount = 0;
							counts.forEach((count, id) => {
								if (count > maxCount && count >= 3) {
									maxCount = count;
									bestAllyId = id;
								}
							});

							const finalCreditId = bestAllyId || creditToId;

							const isRebelFinalCredit =
								activeRebellion && finalCreditId === activeRebellion.rebelId;
							const canReceiveCredit =
								!isRebelFinalCredit ||
								deJureMap[idx] === activeRebellion.rebelId;

							if (canReceiveCredit) {
								if (newInfluence > 0.05 || currentOccupierId === 0) {
									primaryOccupierMap[idx] = finalCreditId;
								}
							}
						}
					}

					sideInfluenceMaps[mySideIdx][idx] = newInfluence;
					// Decay opposing sides' influence when we enter a cell
					for (let si = 0; si < sideInfluenceMaps.length; si++) {
						if (si !== mySideIdx && sideInfluenceMaps[si][idx] > 0) {
							sideInfluenceMaps[si][idx] = Math.max(
								0,
								sideInfluenceMaps[si][idx] - cellDelta * 0.5,
							);
						}
					}
					// De-jure owner reclaim bonus: 1.5x influence when retaking own territory
					if (worldControlMap[idx] === u.sovereignId) {
						sideInfluenceMaps[mySideIdx][idx] *= 1.5;
					}
					syncOccupationFromSideInfluence(idx);
				}
			}
		}
	}
}

/**
 * Simple Point-In-Polygon check for GeoJSON features
 */
export function isPointInFeature(lat, lng, feature) {
	const point = [lng, lat];
	const type = feature.geometry.type;
	const coords = feature.geometry.coordinates;

	const isPointInRing = (ring, pt) => {
		let inside = false;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const xi = ring[i][0],
				yi = ring[i][1];
			const xj = ring[j][0],
				yj = ring[j][1];
			const intersect =
				yi > pt[1] !== yj > pt[1] &&
				pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
			if (intersect) inside = !inside;
		}
		return inside;
	};

	const checkPolygon = (polygon, pt) => {
		// Exterior ring
		if (!isPointInRing(polygon[0], pt)) return false;
		// Interior holes
		for (let i = 1; i < polygon.length; i++) {
			if (isPointInRing(polygon[i], pt)) return false;
		}
		return true;
	};

	if (type === "Polygon") {
		return checkPolygon(coords, point);
	} else if (type === "MultiPolygon") {
		return coords.some((part) => checkPolygon(part, point));
	}
	return false;
}

/**
 * Procedurally generates desert biomes based on known global geographical coordinates.
 * This provides visual variety in 'Simplified Mode' for real-earth scenarios.
 */
export function applyEarthDeserts() {
	if (!biomeMask) return;

	// Bounding boxes for major global deserts
	const deserts = [
		{ lat: [14, 31], lng: [-17, 35] }, // Sahara
		{ lat: [12, 32], lng: [35, 59] }, // Arabian
		{ lat: [36, 48], lng: [75, 115] }, // Gobi / Taklamakan
		{ lat: [-34, -18], lng: [114, 150] }, // Australian Outback
		{ lat: [-30, -18], lng: [14, 28] }, // Kalahari / Namib
		{ lat: [23, 37], lng: [-118, -102] }, // Mojave / Sonoran / Chihuahuan
		{ lat: [-27, -15], lng: [-72, -66] }, // Atacama
		{ lat: [24, 32], lng: [68, 77] }, // Thar
		{ lat: [35, 45], lng: [52, 72] }, // Central Asian (Kyzylkum/Kara-Kum)
	];

	for (let i = 0; i < landMask.length; i++) {
		if (landMask[i] === 0) continue;

		const y = Math.floor(i / gridWidth);
		const x = i % gridWidth;
		const lat = y * CONFIG.GRID_RES - 90;
		const lng = x * CONFIG.GRID_RES - 180;

		for (const d of deserts) {
			if (
				lat >= d.lat[0] &&
				lat <= d.lat[1] &&
				lng >= d.lng[0] &&
				lng <= d.lng[1]
			) {
				// Apply a sinus-based noise threshold to prevent perfectly rectangular deserts
				const n = Math.sin(lat * 3.5) * Math.cos(lng * 3.5);
				if (n > -0.85) {
					biomeMask[i] = 1;
				}
				break;
			}
		}
	}
}

export async function loadFlagCodes() {
	if (flagCodes) return;
	try {
		const url = "assets/geodata/flagcodes.json";
		flagCodes = await fetchJSONWithCache(url);
	} catch (e) {
		console.error("Failed to load flag codes", e);
	}
}

export const FLAG_CDN_MAPPING = {
	ad: "Andorra",
	ae: "United Arab Emirates",
	af: "Afghanistan",
	ag: "Antigua and Barbuda",
	ai: "Anguilla",
	al: "Albania",
	am: "Armenia",
	ao: "Angola",
	aq: "Antarctica",
	ar: "Argentina",
	as: "American Samoa",
	at: "Austria",
	au: "Australia",
	aw: "Aruba",
	ax: "Åland Islands",
	az: "Azerbaijan",
	ba: "Bosnia and Herzegovina",
	bb: "Barbados",
	bd: "Bangladesh",
	be: "Belgium",
	bf: "Burkina Faso",
	bg: "Bulgaria",
	bh: "Bahrain",
	bi: "Burundi",
	bj: "Benin",
	bl: "Saint Barthélemy",
	bm: "Bermuda",
	bn: "Brunei",
	bo: "Bolivia",
	bq: "Caribbean Netherlands",
	br: "Brazil",
	bs: "Bahamas",
	bt: "Bhutan",
	bv: "Bouvet Island",
	bw: "Botswana",
	by: "Belarus",
	bz: "Belize",
	ca: "Canada",
	cc: "Cocos (Keeling) Islands",
	cd: "DR Congo",
	cf: "Central African Republic",
	cg: "Republic of the Congo",
	ch: "Switzerland",
	ci: "Côte d'Ivoire (Ivory Coast)",
	ck: "Cook Islands",
	cl: "Chile",
	cm: "Cameroon",
	cn: "China",
	co: "Colombia",
	cr: "Costa Rica",
	cu: "Cuba",
	cv: "Cape Verde",
	cw: "Curaçao",
	cx: "Christmas Island",
	cy: "Cyprus",
	cz: "Czechia",
	de: "Germany",
	dj: "Djibouti",
	dk: "Denmark",
	dm: "Dominica",
	do: "Dominican Republic",
	dz: "Algeria",
	ec: "Ecuador",
	ee: "Estonia",
	eg: "Egypt",
	eh: "Western Sahara",
	er: "Eritrea",
	es: "Spain",
	et: "Ethiopia",
	eu: "European Union",
	fi: "Finland",
	fj: "Fiji",
	fk: "Falkland Islands",
	fm: "Micronesia",
	fo: "Faroe Islands",
	fr: "France",
	ga: "Gabon",
	gb: "United Kingdom",
	"gb-eng": "England",
	"gb-nir": "Northern Ireland",
	"gb-sct": "Scotland",
	"gb-wls": "Wales",
	gd: "Grenada",
	ge: "Georgia",
	gf: "French Guiana",
	gg: "Guernsey",
	gh: "Ghana",
	gi: "Gibraltar",
	gl: "Greenland",
	gm: "Gambia",
	gn: "Guinea",
	gp: "Guadeloupe",
	gq: "Equatorial Guinea",
	gr: "Greece",
	gs: "South Georgia",
	gt: "Guatemala",
	gu: "Guam",
	gw: "Guinea-Bissau",
	gy: "Guyana",
	hk: "Hong Kong",
	hm: "Heard Island and McDonald Islands",
	hn: "Honduras",
	hr: "Croatia",
	ht: "Haiti",
	hu: "Hungary",
	id: "Indonesia",
	ie: "Ireland",
	il: "Israel",
	im: "Isle of Man",
	in: "India",
	io: "British Indian Ocean Territory",
	iq: "Iraq",
	ir: "Iran",
	is: "Iceland",
	it: "Italy",
	je: "Jersey",
	jm: "Jamaica",
	jo: "Jordan",
	jp: "Japan",
	ke: "Kenya",
	kg: "Kyrgyzstan",
	kh: "Cambodia",
	ki: "Kiribati",
	km: "Comoros",
	kn: "Saint Kitts and Nevis",
	kp: "North Korea",
	kr: "South Korea",
	kw: "Kuwait",
	ky: "Cayman Islands",
	kz: "Kazakhstan",
	la: "Laos",
	lb: "Lebanon",
	lc: "Saint Lucia",
	li: "Liechtenstein",
	lk: "Sri Lanka",
	lr: "Liberia",
	ls: "Lesotho",
	lt: "Lithuania",
	lu: "Luxembourg",
	lv: "Latvia",
	ly: "Libya",
	ma: "Morocco",
	mc: "Monaco",
	md: "Moldova",
	me: "Montenegro",
	mf: "Saint Martin",
	mg: "Madagascar",
	mh: "Marshall Islands",
	mk: "North Macedonia",
	ml: "Mali",
	mm: "Myanmar",
	mn: "Mongolia",
	mo: "Macau",
	mp: "Northern Mariana Islands",
	mq: "Martinique",
	mr: "Mauritania",
	ms: "Montserrat",
	mt: "Malta",
	mu: "Mauritius",
	mv: "Maldives",
	mw: "Malawi",
	mx: "Mexico",
	my: "Malaysia",
	mz: "Mozambique",
	na: "Namibia",
	nc: "New Caledonia",
	ne: "Niger",
	nf: "Norfolk Island",
	ng: "Nigeria",
	ni: "Nicaragua",
	nl: "Netherlands",
	no: "Norway",
	np: "Nepal",
	nr: "Nauru",
	nu: "Niue",
	nz: "New Zealand",
	om: "Oman",
	pa: "Panama",
	pe: "Peru",
	pf: "French Polynesia",
	pg: "Papua New Guinea",
	ph: "Philippines",
	pk: "Pakistan",
	pl: "Poland",
	pm: "Saint Pierre and Miquelon",
	pn: "Pitcairn Islands",
	pr: "Puerto Rico",
	ps: "Palestine",
	pt: "Portugal",
	pw: "Palau",
	py: "Paraguay",
	qa: "Qatar",
	re: "Réunion",
	ro: "Romania",
	rs: "Serbia",
	ru: "Russia",
	rw: "Rwanda",
	sa: "Saudi Arabia",
	sb: "Solomon Islands",
	sc: "Seychelles",
	sd: "Sudan",
	se: "Sweden",
	sg: "Singapore",
	sh: "Saint Helena, Ascension and Tristan da Cunha",
	si: "Slovenia",
	sj: "Svalbard and Jan Mayen",
	sk: "Slovakia",
	sl: "Sierra Leone",
	sm: "San Marino",
	sn: "Senegal",
	so: "Somalia",
	sr: "Suriname",
	ss: "South Sudan",
	st: "São Tomé and Príncipe",
	sv: "El Salvador",
	sx: "Sint Maarten",
	sy: "Syria",
	sz: "Eswatini (Swaziland)",
	tc: "Turks and Caicos Islands",
	td: "Chad",
	tf: "French Southern and Antarctic Lands",
	tg: "Togo",
	th: "Thailand",
	tj: "Tajikistan",
	tk: "Tokelau",
	tl: "Timor-Leste",
	tm: "Turkmenistan",
	tn: "Tunisia",
	to: "Tonga",
	tr: "Turkey",
	tt: "Trinidad and Tobago",
	tv: "Tuvalu",
	tw: "Taiwan",
	tz: "Tanzania",
	ua: "Ukraine",
	ug: "Uganda",
	um: "United States Minor Outlying Islands",
	un: "United Nations",
	us: "United States",
	"us-ak": "Alaska",
	"us-al": "Alabama",
	"us-ar": "Arkansas",
	"us-az": "Arizona",
	"us-ca": "California",
	"us-co": "Colorado",
	"us-ct": "Connecticut",
	"us-de": "Delaware",
	"us-fl": "Florida",
	"us-ga": "Georgia",
	"us-hi": "Hawaii",
	"us-ia": "Iowa",
	"us-id": "Idaho",
	"us-il": "Illinois",
	"us-in": "Indiana",
	"us-ks": "Kansas",
	"us-ky": "Kentucky",
	"us-la": "Louisiana",
	"us-ma": "Massachusetts",
	"us-md": "Maryland",
	"us-me": "Maine",
	"us-mi": "Michigan",
	"us-mn": "Minnesota",
	"us-mo": "Missouri",
	"us-ms": "Mississippi",
	"us-mt": "Montana",
	"us-nc": "North Carolina",
	"us-nd": "North Dakota",
	"us-ne": "Nebraska",
	"us-nh": "New Hampshire",
	"us-nj": "New Jersey",
	"us-nm": "New Mexico",
	"us-nv": "Nevada",
	"us-ny": "New York",
	"us-oh": "Ohio",
	"us-ok": "Oklahoma",
	"us-or": "Oregon",
	"us-pa": "Pennsylvania",
	"us-ri": "Rhode Island",
	"us-sc": "South Carolina",
	"us-sd": "South Dakota",
	"us-tn": "Tennessee",
	"us-tx": "Texas",
	"us-ut": "Utah",
	"us-va": "Virginia",
	"us-vt": "Vermont",
	"us-wa": "Washington",
	"us-wi": "Wisconsin",
	"us-wv": "West Virginia",
	"us-wy": "Wyoming",
	uy: "Uruguay",
	uz: "Uzbekistan",
	va: "Vatican City (Holy See)",
	vc: "Saint Vincent and the Grenadines",
	ve: "Venezuela",
	vg: "British Virgin Islands",
	vi: "United States Virgin Islands",
	vn: "Vietnam",
	vu: "Vanuatu",
	wf: "Wallis and Futuna",
	ws: "Samoa",
	xk: "Kosovo",
	ye: "Yemen",
	yt: "Mayotte",
	za: "South Africa",
	zm: "Zambia",
	zw: "Zimbabwe",
};

export function findCodeByName(name) {
	if (!name) return null;
	const search = name.toLowerCase().trim();

	// Check comprehensive static mapping first
	for (const [code, fullName] of Object.entries(FLAG_CDN_MAPPING)) {
		if (fullName.toLowerCase() === search) return code;
	}

	// Then check dynamically fetched codes if available
	if (flagCodes) {
		for (const [code, fullName] of Object.entries(flagCodes)) {
			if (fullName.toLowerCase() === search) return code;
		}
	}

	// Also check for common aliases or shortened names
	const aliases = {
		"united states": "us",
		"united states of america": "us",
		russia: "ru",
		"russian federation": "ru",
		"soviet union": "ru",
		"united kingdom": "gb",
		"great britain": "gb",
		britain: "gb",
		"south korea": "kr",
		"north korea": "kp",
		vietnam: "vn",
		iran: "ir",
		syria: "sy",
		"czech republic": "cz",
		"ivory coast": "ci",
		"republic of the congo": "cg",
		"democratic republic of the congo": "cd",
		"congo, republic of the": "cg",
		"congo, democratic republic of the": "cd",
		czechia: "cz",
		eswatini: "sz",
		swaziland: "sz",
	};
	return aliases[search] || null;
}

export async function loadCities() {
	try {
		// Upgrade to 50m resolution for a significantly higher city count (thousands vs hundreds)
		const url =
			"assets/geodata/50m/cultural/ne_50m_populated_places_simple.json";
		const data = await fetchJSONWithCache(url);
		cities = data.features.map((f, idx) => ({
			id: idx + 1,
			name: f.properties.name || f.properties.NAME || "City",
			lat: f.geometry.coordinates[1],
			lng: f.geometry.coordinates[0],
			pop: f.properties.pop_max || 0,
			isCapital: f.properties.adm0cap === 1,
			ownerId: null,
			isCustom: false,
		}));

		// Apply historical renames for the 1936 WW2 scenario
		if (currentScenarioContext && currentScenarioContext.id === "ww2_1936") {
			cities.forEach((city) => {
				if (city.name === "Kaliningrad") {
					city.name = "Koenisberg";
				}
				if (city.name === "Gdańsk" || city.name === "Gdansk") {
					city.name = "Danzig";
				}
			});
		}
	} catch (err) {
		console.error("Failed to load cities", err);
	}
}

export function handleCountryClick(
	_feature,
	_layer,
	latlng,
	originalEvent = null,
) {
	const idx = getGridIndex(latlng.lat, latlng.lng);

	const isCtrlClick = !!(
		originalEvent &&
		(originalEvent.ctrlKey || originalEvent.metaKey)
	);

	if (godModeActive && godBombActive) {
		const ownerIdAtClick = idx !== -1 ? worldControlMap[idx] : 0;
		const isShift = originalEvent?.shiftKey;

		// Selection Phase: Pick a source country if none selected, or if Shift-clicking a new country
		if (godBombSourceId <= 0 || (isShift && ownerIdAtClick > 0)) {
			if (ownerIdAtClick > 0) {
				godBombSourceId = ownerIdAtClick;
				const meta = countryMetadata[godBombSourceId - 1];
				statusText.innerText = `GOD BOMB: ${meta?.name || "Nation"} is the bomber. Click anywhere to target.`;
				playClickSound();
			} else {
				statusText.innerText = "GOD BOMB: Click a country to select who fires.";
			}
		} else {
			// Firing Phase: Launch bomb from the source country to the clicked location
			const senderMeta = countryMetadata[godBombSourceId - 1];
			const sideIdx = sides.findIndex((s) =>
				s.some((c) => c.id === godBombSourceId),
			);
			const myBases = bases.filter(
				(b) =>
					b.sideIndex === sideIdx &&
					getGridIndex(b.lat, b.lng) !== -1 &&
					worldControlMap[getGridIndex(b.lat, b.lng)] === godBombSourceId,
			);
			let fromLat, fromLng;

			if (myBases.length > 0) {
				const b = myBases[Math.floor(Math.random() * myBases.length)];
				fromLat = b.lat;
				fromLng = b.lng;
			} else if (senderMeta?.stableCenter) {
				fromLat = senderMeta.stableCenter.lat;
				fromLng = senderMeta.stableCenter.lng;
			} else {
				// Fallback for nations with no center or land
				fromLat = latlng.lat + 5;
				fromLng = latlng.lng + 5;
			}

			launchBomb(fromLat, fromLng, latlng.lat, latlng.lng, sideIdx);
			playClickSound();
			statusText.innerText = `GOD BOMB: ${senderMeta?.name || "Nation"} strike launched. (Shift+Click to change bomber)`;
		}
		return;
	}

	if (gameState === "EDITOR_PLACING") {
		placeNewCountry(latlng);
		return;
	}

	if (gameState === "EDITOR_PAINTING_TERRAIN") {
		// paintAt already handles the actual landMask modification via mousedown/mousemove
		return;
	}

	if (gameState === "EDITOR_PLACING_DIVISION") {
		const countryIdAtClick = idx !== -1 ? worldControlMap[idx] : 0;
		if (editingCountryId <= 0) {
			if (countryIdAtClick > 0) {
				editingCountryId = countryIdAtClick;
				const meta = countryMetadata[editingCountryId - 1];
				statusText.innerText = `DEPLOYMENT: ${meta.name} (Click map to deploy divisions)`;
			} else {
				statusText.innerText = "SELECT SOURCE: Click a nation on the map first";
			}
		} else {
			placeDivisionAt(latlng, editingCountryId);
		}
		return;
	}

	if (gameState === "EDITOR_ANNEXING") {
		const targetId = idx !== -1 ? worldControlMap[idx] : 0;
		if (targetId > 0 && targetId !== editingCountryId) {
			const victimMeta = countryMetadata[targetId - 1];
			const victimName = victimMeta ? victimMeta.name : "Target";

			// RELEASABLE TRANSFER: Transfer victim's releasables to the annexer
			countryMetadata.forEach((m) => {
				if (m && m.releasableBy === targetId) {
					m.releasableBy = editingCountryId;
				}
			});

			// Transfer all territory
			for (let i = 0; i < worldControlMap.length; i++) {
				if (worldControlMap[i] === targetId) {
					worldControlMap[i] = editingCountryId;
				}
			}

			// Clean up live simulation data for the victim
			sides.forEach((side) => {
				const sIdx = side.findIndex((c) => c.id === targetId);
				if (sIdx > -1) side.splice(sIdx, 1);
			});
			units = units.filter((u) => u.sovereignId !== targetId);

			statusText.innerText = `ANNEXED: ${victimName} absorbed.`;
			recalculateAllBounds();
			influenceLayer.render();
			updateSidesUI();

			// Return to inspector
			openInspector(editingCountryId);
			gameState = "EDITOR_ACTIVE";
			map.getContainer().classList.remove("painting-cursor");
		} else {
			statusText.innerText =
				"Selection Cancelled: Clicked neutral land or self.";
			openInspector(editingCountryId);
			gameState = "EDITOR_ACTIVE";
			map.getContainer().classList.remove("painting-cursor");
		}
		return;
	}

	if (gameState === "EDITOR_SELECTING_OVERLORD") {
		const sovereignId = idx !== -1 ? worldControlMap[idx] : 0;
		if (sovereignId > 0 && sovereignId !== selectingOverlordForId) {
			setVassalage(selectingOverlordForId, sovereignId);
		} else {
			statusText.innerText = "Selection Cancelled";
		}
		gameState = godModeActive ? "EDITOR_ACTIVE" : "EDITOR_ACTIVE";
		if (godModeActive) gameState = "EDITOR_ACTIVE";
		selectingOverlordForId = -1;
		map.getContainer().classList.remove("painting-cursor");
		return;
	}

	if (gameState === "EDITOR_SELECTING_ALLY") {
		const targetId = idx !== -1 ? worldControlMap[idx] : 0;
		if (targetId > 0 && targetId !== selectingAllyForId) {
			const aMeta = countryMetadata[selectingAllyForId - 1];
			const bMeta = countryMetadata[targetId - 1];
			if (aMeta && bMeta) {
				aMeta.allies = Array.from(new Set([...(aMeta.allies || []), targetId]));
				bMeta.allies = Array.from(
					new Set([...(bMeta.allies || []), selectingAllyForId]),
				);
				statusText.innerText = `Alliance formed: ${aMeta.name} ↔ ${bMeta.name}`;
			}
		} else {
			statusText.innerText = "Ally selection cancelled";
		}
		selectingAllyForId = -1;
		gameState = "EDITOR_ACTIVE";
		map.getContainer().classList.remove("painting-cursor");
		recalculateAllBounds();
		influenceLayer.render();
		return;
	}

	if (gameState === "EDITOR_SELECTING_RELEASER") {
		const sovereignId = idx !== -1 ? worldControlMap[idx] : 0;
		if (sovereignId > 0 && sovereignId !== selectingOverlordForId) {
			setAsReleasable(selectingOverlordForId, sovereignId);
		} else {
			statusText.innerText = "Selection Cancelled";
		}
		gameState = "EDITOR_ACTIVE";
		selectingOverlordForId = -1;
		map.getContainer().classList.remove("painting-cursor");
		return;
	}

	if (idx === -1) return;

	let sovereignId = worldControlMap[idx];

	// Ctrl-click multi-select support in editor / god mode
	if (
		isCtrlClick &&
		sovereignId > 0 &&
		(gameMode === "EDITOR" || godModeActive)
	) {
		if (selectedCountryIds.has(sovereignId)) {
			selectedCountryIds.delete(sovereignId);
		} else {
			selectedCountryIds.add(sovereignId);
		}
		const count = selectedCountryIds.size;
		statusText.innerText =
			count > 0
				? `Selected ${count} countr${count === 1 ? "y" : "ies"} for ZIP export`
				: "Map Editor (Alpha)";
		// Keep normal inspector / setup logic from running on Ctrl-click
		influenceLayer.render();
		return;
	}

	// In God Mode or Simulation, clicking occupied land selects the current occupier
	if (gameState === "SIMULATING" || godModeActive) {
		const occ = occupationMap[idx];
		if (landMask[idx] === 2 && Math.abs(occ) > 0.1) {
			const occupierId = primaryOccupierMap[idx];
			if (occupierId > 0) sovereignId = occupierId;
		}
	}

	if (gameState === "PEACE_SELECT_1") {
		if (sovereignId > 0) {
			const sideCountry = sides
				.flat()
				.filter(Boolean)
				.find((c) => c.id === sovereignId);
			if (sideCountry) {
				peaceSelection1 = sideCountry;
				gameState = "PEACE_SELECT_2";
				statusText.innerText = `Peace for ${sideCountry.name}: Select Opponent`;
				influenceLayer.render();
			}
		}
		return;
	}

	if (gameState === "PEACE_SELECT_2") {
		if (sovereignId > 0) {
			const sideCountry = sides
				.flat()
				.filter(Boolean)
				.find((c) => c.id === sovereignId);
			if (sideCountry) {
				signSelectivePeace(peaceSelection1, sideCountry);
			}
		}
		return;
	}

	if (gameState === "SIMULATING") {
		if (sovereignId > 0) {
			openInspector(sovereignId);
		}
		return;
	}

	if (gameState === "WAR_OVER") return;

	if (
		gameState === "EDITOR_ACTIVE" ||
		gameState === "EDITOR_PAINTING" ||
		gameState === "EDITOR_FILLING" ||
		gameState === "EDITOR_FILLING_TERRAIN"
	) {
		if (gameState === "EDITOR_FILLING") {
			fillAt(latlng);
		} else if (gameState === "EDITOR_FILLING_TERRAIN") {
			fillTerrainAt(latlng);
		} else if (sovereignId > 0) {
			// Select the nation and open the inspector
			editingCountryId = sovereignId;
			openInspector(sovereignId);

			if (godModeActive && gameState === "EDITOR_ACTIVE") {
				const meta = countryMetadata[sovereignId - 1];
				statusText.innerText = `GOD MODE: ${meta.name || "Selected Nation"} selected.`;
			}
		}
		return;
	}

	// Conquest Selection Logic
	if (sovereignId <= 0) return; // Must click a country in Conquest mode

	const meta = countryMetadata[sovereignId - 1];
	if (!meta) return;

	const targetFeature = meta.feature;
	const countryName =
		meta.name ||
		targetFeature?.properties?.NAME ||
		targetFeature?.properties?.name ||
		"Unknown";
	const color = meta.color;

	// Smart Reassignment Logic: If country is already in a side, move it or open inspector
	let existingSideIdx = -1;
	sides.forEach((side, idx) => {
		if (side?.some((c) => c && c.id === sovereignId)) existingSideIdx = idx;
	});

	if (existingSideIdx !== -1) {
		if (existingSideIdx === activeSideIndex) {
			// Already in active side: open inspector for editing, with double-click protection
			if (
				Date.now() - lastSelectionTime > 350 ||
				lastSelectedId !== sovereignId
			) {
				openInspector(sovereignId);
			}
		} else {
			// In a different side: transfer to active side instead of blocking or opening inspector
			const countryToMove = sides[existingSideIdx].find(
				(c) => c.id === sovereignId,
			);
			sides[existingSideIdx] = sides[existingSideIdx].filter(
				(c) => c.id !== sovereignId,
			);
			sides[activeSideIndex].push(countryToMove);
			updateSidesUI();
			statusText.innerText = `REASSIGNED: ${countryName} moved to Side ${String.fromCharCode(65 + activeSideIndex)}`;
			influenceLayer.render();
		}
		lastSelectionTime = Date.now();
		lastSelectedId = sovereignId;
		return;
	}

	if (ffaMode) {
		// In FFA, every new click creates a new side if the current active side isn't empty
		if (sides[activeSideIndex] && sides[activeSideIndex].length > 0) {
			sides.push([]);
			activeSideIndex = sides.length - 1;
		}
	}

	const targetList = sides[activeSideIndex];
	if (!targetList) return;

	const newCountry = {
		feature: targetFeature,
		id: sovereignId,
		color: color,
		name: countryName,
		buffState: meta.buffState || "none", // Carry over buff state from meta
		flag: null,
		strategy: "BALANCED",
		role: "OFFENSE",
	};

	targetList.push(newCountry);

	// In alliance view, automatically recruit other members of the same alliance
	// into the same side when one member is selected.
	if (allianceViewEnabled) {
		const allianceMembers = getAllianceMembers(sovereignId);
		const alreadyInAnySide = new Set(
			sides
				.flat()
				.filter(Boolean)
				.map((c) => c.id),
		);
		allianceMembers.forEach((aid) => {
			if (aid === sovereignId) return;
			if (alreadyInAnySide.has(aid)) return;
			const m = countryMetadata[aid - 1];
			if (!m) return;
			// Only add members that actually have territory on the current map
			const hasLand = worldControlMap?.some?.((v) => v === aid);
			if (!hasLand) return;
			targetList.push({
				feature: m.feature,
				id: m.id,
				color: m.color,
				name: m.name,
				buffState: m.buffState || "none",
				flag: m.tempFlag || null,
				strategy: "BALANCED",
				role: "OFFENSE",
			});
			alreadyInAnySide.add(aid);
		});
	}

	lastSelectionTime = Date.now();
	lastSelectedId = sovereignId;
	updateSidesUI();
	statusText.innerText = "Conflict Setup (Select more or click Inaugurate)";
	influenceLayer.render();

	// Tutorial Progression Logic
	if (tutorialActive) {
		const step = activeTutorialSet[currentTutorialStep];
		if (
			step.actionRequired === "SELECT_GERMANY" &&
			countryName.toLowerCase() === "germany"
		) {
			advanceTutorial();
		} else if (
			step.actionRequired === "SELECT_POLAND" &&
			countryName.toLowerCase() === "poland" &&
			activeSideIndex === 1
		) {
			advanceTutorial();
		}
	}
}

export function spawnSingleUnit(
	sideIdx,
	sovereignId,
	_preferEnemyFront = false,
) {
	// Enforce per‑side unit cap: if this side is already at or above the limit, do not spawn.
	const sideUnits = units.filter((u) => u.sideIndex === sideIdx).length;
	const manualMP = manualSideManpower[sideIdx];
	const effectiveMax =
		manualMP !== null
			? Math.max(
					CONFIG.MAX_UNITS_PER_SIDE,
					Math.min(10000, Math.floor(manualMP / CONFIG.UNIT_TO_SOLDIER_RATIO)),
				)
			: CONFIG.MAX_UNITS_PER_SIDE;
	if (sideUnits >= effectiveMax) return false;

	const supplyFailed = capitalLostCountries?.has(sovereignId);

	// ── Spawn from friendly cities ──────────────────────────────────────
	const friendlyCities = cities.filter((c) => {
		if (!c.ownerId || c.ownerId !== sovereignId) return false;
		const cIdx = getGridIndex(c.lat, c.lng);
		if (cIdx === -1 || landMask[cIdx] === 0) return false;
		if (dominantSideMap[cIdx] !== sideIdx) return false;
		return true;
	});

	let lat, lng;
	const _isFromFront = false;

	if (friendlyCities.length > 0) {
		// Pick a random friendly city, bias toward frontline-adjacent ones
		const frontlineCities = friendlyCities.filter((c) => {
			const cIdx = getGridIndex(c.lat, c.lng);
			const neighbors = [
				cIdx + 1,
				cIdx - 1,
				cIdx + gridWidth,
				cIdx - gridWidth,
			];
			for (const n of neighbors) {
				if (n >= 0 && n < landMask.length) {
					const nds = dominantSideMap[n];
					if (nds >= 0 && nds !== sideIdx) return true;
				}
			}
			return false;
		});

		const pick =
			frontlineCities.length > 0 && !supplyFailed
				? frontlineCities[Math.floor(Math.random() * frontlineCities.length)]
				: friendlyCities[Math.floor(Math.random() * friendlyCities.length)];

		lat = pick.lat + (Math.random() - 0.5) * CONFIG.GRID_RES * 0.8;
		lng = pick.lng + (Math.random() - 0.5) * CONFIG.GRID_RES * 0.8;

		// Validate: ensure still within friendly territory
		const vIdx = getGridIndex(lat, lng);
		if (
			vIdx === -1 ||
			worldControlMap[vIdx] !== sovereignId ||
			dominantSideMap[vIdx] !== sideIdx
		) {
			lat = pick.lat;
			lng = pick.lng;
		}
	} else {
		// Fallback: spawn in friendly warzone territory
		const theaterIndices = [];
		const step = Math.max(1, Math.floor(landMask.length / 500000));
		for (let i = 0; i < landMask.length; i += step) {
			if (
				landMask[i] === 2 &&
				worldControlMap[i] === sovereignId &&
				dominantSideMap[i] === sideIdx
			) {
				theaterIndices.push(i);
			}
		}
		if (theaterIndices.length === 0) return false;

		const idx =
			theaterIndices[Math.floor(Math.random() * theaterIndices.length)];
		const y = Math.floor(idx / gridWidth);
		const x = idx % gridWidth;
		lat = y * CONFIG.GRID_RES - 90 + CONFIG.GRID_RES / 2;
		lng = x * CONFIG.GRID_RES - 180 + CONFIG.GRID_RES / 2;
	}

	const finalIdx = getGridIndex(lat, lng);
	const isMountainCell =
		terrainMask && finalIdx >= 0 ? terrainMask[finalIdx] > 0.35 : false;
	// Alpenjägers: mostly drawn from mountainous recruitment cells
	const isAlpen = isMountainCell && Math.random() < 0.4;

	// Base health for this new unit
	let unitHealth =
		CONFIG.UNIT_HEALTH * (isAlpen ? CONFIG.ALPEN_HEALTH_MULT : 1);
	// When supply has failed (capital captured), newly raised units are under‑equipped and fragile
	if (supplyFailed) {
		unitHealth *= 0.4; // 60% health penalty
	}

	units.push({
		id: Math.random(),
		lat,
		lng,
		sideIndex: sideIdx,
		sovereignId: sovereignId,
		beneficiaryId: sovereignId,
		isAlpenjager: !!isAlpen,
		health: unitHealth,
		lastAttack: 0,
		deployTicks: 30,
	});

	if (sideIdx >= 0 && sideIdx < MAX_SIDES) {
		sideSoldiers[sideIdx] += soldiersPerUnit[sideIdx];
	}

	return true;
}

export function setGameTimeFromInputs() {
	if (!timeSystemCheckbox?.checked) {
		gameTimeEnabled = false;
		gameTimeDate = null;
		gameTimeAccumulatorMs = 0;
		if (gameDateDisplay) gameDateDisplay.style.display = "none";
		return;
	}
	const y = parseInt(timeYearInput.value || "0", 10);
	const m = parseInt(timeMonthInput.value || "0", 10);
	const d = parseInt(timeDayInput.value || "0", 10);
	if (!y || !m || !d) {
		// fallback default if user left blanks
		gameTimeDate = { year: 1936, month: 1, day: 1 };
	} else {
		gameTimeDate = { year: y, month: m, day: d };
	}
	gameTimeEnabled = true;
	gameTimeAccumulatorMs = 0;
	if (gameDateDisplay) {
		gameDateDisplay.style.display = "block";
		gameDateDisplay.textContent = formatGameDate();
	}
}

export function formatGameDate() {
	if (!gameTimeDate) return "0000/00/00";
	const y = gameTimeDate.year.toString().padStart(4, "0");
	const m = gameTimeDate.month.toString().padStart(2, "0");
	const d = gameTimeDate.day.toString().padStart(2, "0");
	return `${y}/${m}/${d}`;
}

export function daysInMonth(year, month) {
	if (
		month === 1 ||
		month === 3 ||
		month === 5 ||
		month === 7 ||
		month === 8 ||
		month === 10 ||
		month === 12
	)
		return 31;
	if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
	// February
	const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
	return isLeap ? 29 : 28;
}

export function advanceGameDateOneDay() {
	if (!gameTimeEnabled || !gameTimeDate) return;
	gameTimeDate.day += 1;
	const dim = daysInMonth(gameTimeDate.year, gameTimeDate.month);
	if (gameTimeDate.day > dim) {
		gameTimeDate.day = 1;
		gameTimeDate.month += 1;
		if (gameTimeDate.month > 12) {
			gameTimeDate.month = 1;
			gameTimeDate.year += 1;
		}
	}
	if (gameDateDisplay) {
		gameDateDisplay.textContent = formatGameDate();
	}
}

export function tickGameTime(elapsedMs) {
	if (
		!gameTimeEnabled ||
		gameState !== "SIMULATING" ||
		isPaused ||
		!gameTimeDate
	)
		return;
	// Scale in-game time progression with the current simulation speed
	gameTimeAccumulatorMs += elapsedMs * simSpeed;
	const step = 500; // 0.5 seconds per day at 1x speed
	while (gameTimeAccumulatorMs >= step) {
		advanceGameDateOneDay();
		gameTimeAccumulatorMs -= step;
	}
}

export function deepClone(obj) {
	if (!obj) return obj;
	try {
		return structuredClone(obj);
	} catch (_e) {
		return JSON.parse(
			JSON.stringify(obj, (_k, v) => {
				if (
					v &&
					typeof v === "object" &&
					(v instanceof HTMLImageElement ||
						v instanceof HTMLCanvasElement ||
						v instanceof Node)
				) {
					return undefined;
				}
				return v;
			}),
		);
	}
}

export async function startWar() {
	const activeSides = sides.filter((s) => s.length > 0);
	if (activeSides.length < 2) {
		alert("Please assign countries to at least two sides.");
		return;
	}

	setLoadingThematic(false);
	loadingOverlay.style.display = "flex";
	loadingStatus.innerText = getTranslation("LOADING");
	loadingBar.style.width = "0%";

	await new Promise((r) => setTimeout(r, 50));

	try {
		await _startWarInner();
	} catch (err) {
		console.error("[MW] startWar FAILED:", err);
		loadingOverlay.style.display = "none";
		alert(`War failed to start: ${err.message}`);
	}
}

export async function _startWarInner() {
	initAudio().then(() => {
		playWarAmbiance();
	});
	playWarStartSound();

	// Capture a clean snapshot of the scenario just before the war starts
	// so QUICK RESTART can restore it instantly with no loading screen.
	initialWorldControlMapSnapshot = worldControlMap
		? new Uint16Array(worldControlMap)
		: null;
	initialDeJureMapSnapshot = deJureMap ? new Uint16Array(deJureMap) : null;
	initialProvinceMapSnapshot = provinceMap ? new Int32Array(provinceMap) : null;
	initialLandMaskSnapshot = landMask ? new Uint8Array(landMask) : null;
	initialBiomeMaskSnapshot = biomeMask ? new Uint8Array(biomeMask) : null;
	initialCountryMetadataSnapshot = deepClone(countryMetadata);
	initialCitiesSnapshot = deepClone(cities);

	const _attackers = sides[0] || [];
	const _defenders = sides[1] || [];

	// Initialize time system for this war
	setGameTimeFromInputs();

	// Read optional manual manpower overrides from the setup inputs
	manualSideManpower.fill(null);
	for (let si = 0; si < sides.length; si++) {
		const mpInput = document.getElementById(`manpower-side-${si}`);
		const parsed = mpInput ? parseInt(mpInput.value, 10) : NaN;
		manualSideManpower[si] =
			!Number.isNaN(parsed) && parsed > 0 ? parsed : null;
	}

	gameState = "SIMULATING";
	isPaused = false;
	warGraceEndTick = simFrameCount + CONFIG.WAR_GRACE_TICKS;

	// Hard reset dynamic war-state before building a new theater.
	// This prevents stale frontline/occupation data from previous wars from
	// pulling units to old hotspots or breaking capitulation logic.
	for (let i = 0; i < landMask.length; i++) {
		if (landMask[i] === 2) landMask[i] = 1;
		for (let s = 0; s < sideInfluenceMaps.length; s++)
			sideInfluenceMaps[s][i] = 0;
		dominantSideMap[i] = -1;
		occupationMap[i] = 0;
		primaryOccupierMap[i] = 0;
	}
	_cachedP1T = 0;
	_cachedP2T = 0;
	_cachedSideTerritoryCounts = [];
	_cachedSideTerritoryPcts = [];
	latestCountryStats.clear();
	aiCountryState.clear();
	_warPlan = [];
	sides.flat().forEach((c) => {
		if (!c) return;
		c.lastControlledCount = undefined;
		c.lastOwnedCount = undefined;
		c._aiPrevControlled = undefined;
		c._aiStallTicks = 0;
		c._aiInitialCities = undefined;
	});

	// Cinematic Mode logic
	cinematicMode =
		document.getElementById("cinematic-mode-checkbox")?.checked || false;
	if (cinematicMode) {
		document.getElementById("game-status").style.display = "none";
		document.getElementById("stats-panel").style.display = "none";

		// Start Recording
		try {
			const canvas = influenceLayer._container;
			recordedChunks = [];
			const stream = canvas.captureStream(30); // 30fps recording
			mediaRecorder = new MediaRecorder(stream, {
				mimeType: "video/webm; codecs=vp9",
			});
			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) recordedChunks.push(e.data);
			};
			mediaRecorder.start();
		} catch (e) {
			console.warn("MediaRecorder failed to start:", e);
		}
	} else {
		document.getElementById("game-status").style.display = "flex";
		document.getElementById("stats-panel").style.display = "block";
	}
	pauseBtn.innerText = "⏸";
	pauseBtn.style.background = "#f39c12";
	lastTreatyTime = Date.now();
	sideCasualties.fill(0);
	countryCasualties.clear();
	casualtyByAttacker.clear();
	sides.flat().forEach((c) => {
		countryCasualties.set(c.id, 0);
		casualtyByAttacker.set(c.id, new Map());
	});
	frameAccumulator = 0;
	simFrameCount = 0;
	// Reset cached frontline field state between wars.
	// Without this, a new war may reuse old direction vectors and pull both
	// teams toward the same stale hotspot from the previous conflict.
	frontlineFieldTick = -999;
	_workerBusy = false;
	_cachedFrontierCells = [];
	_frontierScanCounter = 0;
	_frontlinePolys = {};
	_neutralBorderPolys = {};
	_frontlinePolyTick = -999;

	// Reset cached frontline field state between wars.
	_frontlineSourceCell = null;
	setSpeed(0); // Conflicts start at 0.5 speed (Index 0 in SPEED_STEPS)

	// Initialize diplomacy and technology toggles
	peaceTreatiesDisabled = noPeaceCheckbox.checked;

	const startYear = gameTimeEnabled && gameTimeDate ? gameTimeDate.year : 2024;
	// Historical technology gate: bombs/missiles are disabled for any scenario starting before 1942
	let isHistoricalGateActive = gameTimeEnabled && startYear < 1942;

	// Also look at the scenario name to decide if this is a pre-missile era
	const scName = (currentScenarioContext?.name || "").toLowerCase();
	const preMissileKeywords = [
		"1936",
		"1914",
		"1804",
		"1492",
		"1 ad",
		"napoleonic",
		"ww1",
		"great war",
		"renaissance",
		"classical",
		"antique",
	];
	if (preMissileKeywords.some((k) => scName.includes(k))) {
		isHistoricalGateActive = true;
	}

	bombsDisabled =
		disableBombsCheckbox.checked || !missilesEnabled || isHistoricalGateActive;

	statusText.innerText = ffaMode
		? "Free For All Active"
		: "Global Conflict Active";
	recalculateAllBounds();
	setupPanel.style.display = "none";
	statsPanel.style.display = "block";
	casualtyPanel.style.display = "flex";
	resetBtn.style.display = "block";
	updateRestartVisibility();

	// Final sync of mountain and province state before sim starts
	mountainsEnabled = !setupDisableMountainsCheckbox.checked;
	_provincesEnabled = !setupDisableProvincesCheckbox.checked;
	document.getElementById("speed-controls").style.display = "flex";
	godModeBtn.style.display = "block";
	if (godModeActive) godBombBtn.style.display = "block";
	forcePeaceBtn.style.display = "block";
	unitCountsDiv.style.display = "flex";
	treatyAlert.style.display = "none";

	const getCode = (feat) => {
		if (!feat?.properties) return "un";
		const p = feat.properties;
		let code =
			p.ISO_A2 || p.iso_a2 || p.ISO_A2_EH || p.iso_a2_eh || p.ADDR_A2 || "un";
		if (code === "-99") code = "un";
		return code.toLowerCase();
	};

	// Optimize: Single pass to count initial cells and set up masks/occupancy
	const countryToSideMap = new Map();
	const cellCounts = new Map();
	const countryIndices = new Map();
	const sideCellIndices = sides.map(() => []);

	// Ensure country bounds are up to date before we derive any war theater extents
	recalculateAllBounds();

	initialCombatants = [];
	sides.forEach((side, idx) => {
		side.forEach((c) => {
			initialCombatants.push({
				id: c.id,
				name: c.name,
				sideIndex: idx,
			});
			countryToSideMap.set(c.id, idx);
			cellCounts.set(c.id, 0);
			countryIndices.set(c.id, []);

			// Flag initialization: Reuse existing flag objects from metadata to prevent flickering and redundant fetches
			const meta = countryMetadata.find((m) => m && m.id === c.id);
			if (meta?.tempFlag) {
				c.flag = meta.tempFlag;
			} else {
				c.flag = new Image();
				c.flag.crossOrigin = "anonymous";
				if (meta?.flagUrl) {
					c.flag.src = meta.flagUrl;
				} else {
					const nameCode = findCodeByName(c.name);
					const src = nameCode
						? `https://flagcdn.com/w80/${nameCode}.webp`
						: c.feature
							? `https://flagcdn.com/w80/${getCode(c.feature)}.webp`
							: null;
					if (src) c.flag.src = src;
				}
				if (meta) meta.tempFlag = c.flag;
			}
			c.isCapitulated = false;
			c.isSaturated = false;
		});
	});

	primaryOccupierMap.fill(0);

	// SATELLITE THEATER DEFINITION:
	// Ensure we have complete, non-viewport-limited bounds for every country involved.
	// This fixes the "early frontline cutoff" bug in big countries.
	recalculateAllBounds(true);

	// Determine the minimal bounding box that covers all warring countries on the grid
	let minX = gridWidth - 1;
	let maxX = 0;
	let minY = gridHeight - 1;
	let maxY = 0;

	countryMetadata.forEach((meta) => {
		if (!meta) return;
		if (!countryToSideMap.has(meta.id)) return;
		if (!meta.bounds) return;
		minX = Math.min(minX, meta.bounds.minX);
		maxX = Math.max(maxX, meta.bounds.maxX);
		minY = Math.min(minY, meta.bounds.minY);
		maxY = Math.max(maxY, meta.bounds.maxY);
	});

	// Fallback to full map if bounds are invalid for some reason
	if (
		!Number.isFinite(minX) ||
		!Number.isFinite(maxX) ||
		!Number.isFinite(minY) ||
		!Number.isFinite(maxY) ||
		minX < 0 ||
		minY < 0 ||
		maxX <= minX ||
		maxY <= minY
	) {
		minX = 0;
		minY = 0;
		maxX = gridWidth - 1;
		maxY = gridHeight - 1;
	}

	// THE OPTIMIZED PASS: Only scan the war theater bounding box, chunked to keep UI responsive
	const regionWidth = maxX - minX + 1;
	const regionHeight = maxY - minY + 1;
	const regionTotalCells = regionWidth * regionHeight;
	const chunkSize = 250000; // Smaller chunks for smoother big-war startup

	let processed = 0;
	for (let y = minY; y <= maxY; y++) {
		const rowOffset = y * gridWidth;
		for (let x = minX; x <= maxX; x++) {
			const i = rowOffset + x;
			const id = worldControlMap[i];
			if (id > 0 && countryToSideMap.has(id)) {
				const sideIdx = countryToSideMap.get(id);

				landMask[i] = 2;
				sideInfluenceMaps[sideIdx][i] = 1.0;
				syncOccupationFromSideInfluence(i);
				primaryOccupierMap[i] = id;

				cellCounts.set(id, cellCounts.get(id) + 1);
				countryIndices.get(id).push(i);
				sideCellIndices[sideIdx].push(i);
			}
			processed++;
			if (processed % chunkSize === 0) {
				loadingBar.style.width = `${Math.min(90, (processed / regionTotalCells) * 70)}%`;
				// Yield back to the browser so the UI doesn't freeze on giant conflicts
				await new Promise((r) => setTimeout(r, 0));
			}
		}
	}

	// Set counts back to country objects
	sides.forEach((side) => {
		side.forEach((c) => {
			c.initialCells = cellCounts.get(c.id) || 0;
		});
	});

	// --- GENERALS & BATTLE PLANS ---
	// Each side gets a "general" with a plan quality; underdogs with a brilliant plan get powerful buffs.
	generals = [];
	const sideLand = sides.map((side) =>
		side.reduce((sum, c) => sum + (cellCounts.get(c.id) || 0), 0),
	);

	// Automatically switch to POLITICAL view at the start of every war for consistent visibility.
	viewMode = "POLITICAL";
	if (viewModeBtn) {
		viewModeBtn.innerText = "POLITICAL";
		viewModeBtn.style.background = "#3498db";
	}
	if (influenceLayer && typeof influenceLayer._update === "function") {
		influenceLayer._forceRender = true;
		influenceLayer._update();
	}

	sides.forEach((side, idx) => {
		const myLand = sideLand[idx] || 0;
		const enemyLand = sideLand.reduce(
			(sum, v, i) => (i === idx ? sum : sum + v),
			0,
		);
		const isUnderdog = enemyLand > 0 && myLand < enemyLand;

		// Base plan quality; underdogs get a small bias towards better plans.
		// Overall values are kept modest so "cracked" generals are rare.
		let planQuality = Math.random();
		if (isUnderdog) {
			// Pull slightly towards the upper half but keep a lot of randomness.
			planQuality = Math.min(1, planQuality * 0.3 + 0.3 + Math.random() * 0.2);
		}

		const general = {
			sideIndex: idx,
			isUnderdog,
			planQuality,
			name: isUnderdog ? `Underdog General ${idx + 1}` : `General ${idx + 1}`,
		};
		generals.push(general);

		// If the plan is strong enough and this side is the underdog, consider super‑buffs.
		// However, if the opposing pole already fields heavily buffed nations (buff/super/godly),
		// their raw quality largely negates this general advantage.
		const enemyHasStrongBuff = sides.some(
			(otherSide, j) =>
				j !== idx &&
				otherSide.some((c) =>
					["buff", "super", "godly"].includes(c.buffState || "none"),
				),
		);

		// Make strong underdog generals much rarer (high threshold) and disable them
		// when facing strongly buffed opponents (e.g. Luxembourg vs a buffed Germany).
		if (isUnderdog && planQuality > 0.9 && !enemyHasStrongBuff) {
			side.forEach((c) => {
				c.buffState = c.buffState === "godly" ? "godly" : "super";
				const meta = countryMetadata.find((m) => m && m.id === c.id);
				if (meta) meta.buffState = c.buffState;
			});
		}
	});

	sideColors = [...DEFAULT_SIDE_COLORS];
	sides.forEach((side, idx) => {
		if (side.length > 0 && side[0].color) {
			sideColors[idx] = side[0].color;
		}
	});

	rebuildStatsPanel();

	activeTheaterCities = cities.filter((c) => {
		const idx = getGridIndex(c.lat, c.lng);
		if (idx !== -1 && landMask[idx] === 2) {
			c.sovereignId = worldControlMap[idx];
			return true;
		}
		return false;
	});

	// Identify frontline cells for each country for smarter spawning
	const frontlineIndices = new Map();
	sides.flat().forEach((c) => {
		frontlineIndices.set(c.id, []);
	});

	// Scan warzone for borders to define the initial "front"
	const totalCells = worldControlMap.length;
	for (let i = 0; i < totalCells; i++) {
		const id = worldControlMap[i];
		if (id > 0 && countryToSideMap.has(id)) {
			const sideIdx = countryToSideMap.get(id);
			const _y = Math.floor(i / gridWidth);
			const _x = i % gridWidth;
			let isFrontline = false;
			// Check cardinal neighbors and calculate push vector
			const neighbors = [
				{ id: i + 1, dx: 1, dy: 0 },
				{ id: i - 1, dx: -1, dy: 0 },
				{ id: i + gridWidth, dx: 0, dy: 1 },
				{ id: i - gridWidth, dx: 0, dy: -1 },
			];
			let vx = 0,
				vy = 0;
			for (const n of neighbors) {
				if (n.id >= 0 && n.id < totalCells) {
					const nId = worldControlMap[n.id];
					// A cell is a frontline if its neighbor belongs to an enemy side
					if (
						nId > 0 &&
						countryToSideMap.has(nId) &&
						countryToSideMap.get(nId) !== sideIdx
					) {
						isFrontline = true;
						vx -= n.dx; // Vector away from enemy neighbor
						vy -= n.dy;
					}
				}
			}
			if (isFrontline) {
				const mag = Math.sqrt(vx * vx + vy * vy);
				frontlineIndices.get(id).push({
					idx: i,
					vx: mag > 0 ? vx / mag : 0,
					vy: mag > 0 ? vy / mag : 0,
				});
			}
		}
	}

	// Efficient spawn based on pre-collected indices
	sides.forEach((side, sideIdx) => {
		const multiplier = parseFloat(densitySlider.value) || 1.0;

		// Track how many units this side already has so we can enforce CONFIG.MAX_UNITS_PER_SIDE strictly.
		let sideCurrentUnits = units.filter((u) => u.sideIndex === sideIdx).length;

		side.forEach((c) => {
			const theaterIndices = countryIndices.get(c.id);
			const fronts = frontlineIndices.get(c.id);
			if (!theaterIndices || theaterIndices.length === 0) return;

			// Diminishing Density: Large countries have lower unit density to prevent overcrowding
			const sizeFactor = Math.max(1, theaterIndices.length / 1500);
			const densityScale = 1.0 / sizeFactor ** 0.45;

			const fullDesiredCount = Math.floor(
				theaterIndices.length *
					CONFIG.UNIT_DENSITY_FACTOR *
					multiplier *
					densityScale,
			);
			const standingFloor = Math.max(
				AI_MOBILIZATION.INITIAL_SPAWN_MIN,
				Math.floor((c.startingUnitsFloor || 3) * 0.67),
			);
			let desiredCount = Math.floor(
				fullDesiredCount * AI_MOBILIZATION.INITIAL_SPAWN_FRAC,
			);
			desiredCount = Math.max(standingFloor, desiredCount);
			desiredCount = Math.min(
				desiredCount,
				Math.max(standingFloor, fullDesiredCount),
			);

			const remainingCap = Math.max(
				0,
				CONFIG.MAX_UNITS_PER_SIDE - sideCurrentUnits,
			);
			const count = Math.min(desiredCount, remainingCap);
			if (count <= 0) return;

			for (let j = 0; j < count; j++) {
				// At war start, spread units along the frontline with city preference.
				let fromFront = false;
				let fData;

				if (
					fronts &&
					fronts.length > 0 &&
					Math.random() < AI_MOBILIZATION.START_FROM_FRONT_CHANCE
				) {
					// Cycle-based frontline distribution
					const fIdx = j % fronts.length;
					fData = fronts[fIdx];
					fromFront = true;
				} else {
					// Prefer spawning near friendly cities if available
					const friendlyCities = cities.filter((city) => {
						if (!city.ownerId || city.ownerId !== c.id) return false;
						const cIdx = getGridIndex(city.lat, city.lng);
						return cIdx !== -1 && landMask[cIdx] !== 0;
					});
					if (friendlyCities.length > 0) {
						const pick =
							friendlyCities[Math.floor(Math.random() * friendlyCities.length)];
						const cIdx = getGridIndex(pick.lat, pick.lng);
						fData = { idx: cIdx, vx: 0, vy: 0 };
					} else {
						const tidx =
							theaterIndices[Math.floor(Math.random() * theaterIndices.length)];
						fData = { idx: tidx, vx: 0, vy: 0 };
					}
				}

				// Spread units widely along the frontline, distributing evenly
				const py = Math.floor(fData.idx / gridWidth);
				const px = fData.idx % gridWidth;

				const jitterRange = CONFIG.GRID_RES * 1.5;
				const pushBack = fromFront ? CONFIG.GRID_RES * 0.6 : 0;

				let lat =
					py * CONFIG.GRID_RES -
					90 +
					(Math.random() - 0.5) * jitterRange +
					fData.vy * pushBack;
				let lng =
					px * CONFIG.GRID_RES -
					180 +
					(Math.random() - 0.5) * jitterRange +
					fData.vx * pushBack;

				// Validation: Ensure final coordinate is within the country's sovereign grid
				const finalIdx = getGridIndex(lat, lng);
				if (finalIdx === -1 || worldControlMap[finalIdx] !== c.id) {
					lat = py * CONFIG.GRID_RES - 90 + CONFIG.GRID_RES / 2;
					lng = px * CONFIG.GRID_RES - 180 + CONFIG.GRID_RES / 2;
				}

				const isMountainCell = terrainMask && terrainMask[fData.idx] > 0.35;
				const isAlpen = isMountainCell && Math.random() < 0.4;

				units.push({
					id: Math.random(),
					lat,
					lng,
					sideIndex: sideIdx,
					sovereignId: c.id,
					beneficiaryId: c.id,
					isAlpenjager: !!isAlpen,
					health: CONFIG.UNIT_HEALTH * (isAlpen ? CONFIG.ALPEN_HEALTH_MULT : 1),
					lastAttack: 0,
					deployTicks: 30,
				});
				sideCurrentUnits++;
				if (sideCurrentUnits >= CONFIG.MAX_UNITS_PER_SIDE) break;
			}
		});
	});

	/**
	 * Allied Cross‑Deployment:
	 * After initial spawns, push a slice of each country's divisions into allied territory so weaker
	 * friends aren't left with a paper-thin, isolated frontline that gets instantly rolled.
	 */
	sides.forEach((side, sideIdx) => {
		if (!side || side.length < 2) return; // nothing to balance
		const samePoleSides = side; // all entries here share the same pole by construction

		// Sort allies by land size so bigger partners share more units with smaller ones
		const sorted = samePoleSides
			.map((c) => ({
				country: c,
				land: cellCounts.get(c.id) || 0,
			}))
			.sort((a, b) => b.land - a.land);

		// Build quick lookup of candidate cells per country for redistribution
		const perCountryCells = new Map();
		sorted.forEach((entry) => {
			perCountryCells.set(
				entry.country.id,
				(countryIndices.get(entry.country.id) || []).slice(),
			);
		});

		const sideUnits = units.filter((u) => u.sideIndex === sideIdx);
		if (!sideUnits.length) return;

		// For each stronger country, move a small portion of its units into each weaker ally's land
		for (let i = 0; i < sorted.length; i++) {
			const strong = sorted[i];
			if (!strong.land) continue;

			const strongUnits = sideUnits.filter(
				(u) => u.sovereignId === strong.country.id,
			);
			if (strongUnits.length === 0) continue;

			// Up to ~20% of this country's units are available for cross‑deployment (min 2)
			const poolSize = Math.max(2, Math.floor(strongUnits.length * 0.2));

			for (let j = i + 1; j < sorted.length; j++) {
				const weak = sorted[j];
				if (!weak.land) continue;

				const weakCells = perCountryCells.get(weak.country.id);
				if (!weakCells || weakCells.length === 0) continue;

				// Number of units to move into this specific ally's territory (capped)
				const shareCount = Math.min(
					Math.max(1, Math.floor(poolSize / (sorted.length - i - 1))),
					strongUnits.length,
				);
				if (shareCount <= 0) continue;

				for (let k = 0; k < shareCount; k++) {
					const unit = strongUnits.pop();
					if (!unit) break;

					// Pick a random cell belonging to the weaker ally
					const cellIdx =
						weakCells[Math.floor(Math.random() * weakCells.length)];
					const cy = Math.floor(cellIdx / gridWidth);
					const cx = cellIdx % gridWidth;
					const baseLat = cy * CONFIG.GRID_RES - 90;
					const baseLng = cx * CONFIG.GRID_RES - 180;

					// Slight jitter inside the target cell, but keep the unit firmly inside ally territory
					const jitter = CONFIG.GRID_RES * 0.4;
					unit.lat =
						baseLat + CONFIG.GRID_RES / 2 + (Math.random() - 0.5) * jitter;
					unit.lng =
						baseLng + CONFIG.GRID_RES / 2 + (Math.random() - 0.5) * jitter;

					// Make sure longitude stays normalized
					if (unit.lng > 180) unit.lng -= 360;
					else if (unit.lng < -180) unit.lng += 360;

					// Credit for land capture stays with the original sovereign; we only change location
					unit.beneficiaryId = strong.country.id;
				}
			}
		}
	});

	// Historical Tech Guard for Base Generation
	const currentYear = gameTimeDate ? gameTimeDate.year : 2024;
	const allowSilos = !gameTimeEnabled || currentYear >= 1942;

	sideCellIndices.forEach((validIndices, si) => {
		if (!validIndices || validIndices.length === 0) return;

		if (allowSilos) {
			const baseCount = Math.min(
				8,
				Math.max(2, Math.floor(validIndices.length / 500)),
			);
			for (let i = 0; i < baseCount; i++) {
				const randIdx =
					validIndices[Math.floor(Math.random() * validIndices.length)];
				const y = Math.floor(randIdx / gridWidth);
				const x = randIdx % gridWidth;
				bases.push({
					lat: y * CONFIG.GRID_RES - 90 + CONFIG.GRID_RES / 2,
					lng: x * CONFIG.GRID_RES - 180 + CONFIG.GRID_RES / 2,
					sideIndex: si,
				});
			}
		}
	});

	loadingOverlay.style.display = "none";

	if (
		tutorialActive &&
		activeTutorialSet[currentTutorialStep].actionRequired === "START_WAR"
	) {
		advanceTutorial();
	}

	// Initialize displayed manpower, honoring any manual overrides if present.
	// Base manpower comes from units, with an additional city-based bonus so more cities = more manpower.
	sideSoldiers.fill(0);
	initialSideSoldiers.fill(0);
	soldiersPerUnit.fill(CONFIG.UNIT_TO_SOLDIER_RATIO);
	const sideUnitCounts = new Float64Array(MAX_SIDES);
	for (let i = 0; i < units.length; i++) {
		const sIdx = units[i].sideIndex;
		if (sIdx >= 0 && sIdx < MAX_SIDES) sideUnitCounts[sIdx]++;
	}

	for (let sIdx = 0; sIdx < MAX_SIDES; sIdx++) {
		const initialUnits = sideUnitCounts[sIdx] * CONFIG.UNIT_TO_SOLDIER_RATIO;
		initialSideSoldiers[sIdx] =
			manualSideManpower[sIdx] !== null
				? manualSideManpower[sIdx]
				: Math.round(initialUnits);
		sideSoldiers[sIdx] = initialSideSoldiers[sIdx];
		soldiersPerUnit[sIdx] =
			sideUnitCounts[sIdx] > 0
				? initialSideSoldiers[sIdx] / sideUnitCounts[sIdx]
				: CONFIG.UNIT_TO_SOLDIER_RATIO;
	}

	const bounds = L.latLngBounds([]);
	sides.forEach((side) => {
		side.forEach((c) => {
			if (c.feature)
				try {
					bounds.extend(L.geoJSON(c.feature).getBounds());
				} catch (_e) {}
		});
	});

	if (!bounds.isValid()) {
		for (let i = 0; i < worldControlMap.length; i++) {
			const id = worldControlMap[i];
			if (sides.some((s) => s.some((c) => c.id === id))) {
				const y = Math.floor(i / gridWidth);
				const x = i % gridWidth;
				const lat = y * CONFIG.GRID_RES - 90;
				const lng = x * CONFIG.GRID_RES - 180;
				bounds.extend([lat, lng]);
			}
		}
	}

	if (bounds.isValid()) {
		map.fitBounds(bounds.pad(0.2));
	}

	// Automatically join all vassals of countries starting the war if not disabled
	if (!disablePuppetsCheckbox.checked) {
		sides.forEach((side, sIdx) => {
			if (!side) return;
			const initialVassals = [];
			side.forEach((c) => {
				if (!c) return;
				countryMetadata.forEach((m) => {
					if (
						m &&
						m.overlordId === c.id &&
						!sides.flat().some((exist) => exist && exist.id === m.id)
					) {
						initialVassals.push(m.id);
					}
				});
			});
			initialVassals.forEach((vid) => {
				recruitNeutralMidWar(vid, sIdx);
			});
		});
	}

	requestAnimationFrame(updateLoop);
}

export function computeAdjacency() {
	const adj = new Map();
	const total = worldControlMap.length;
	for (let i = 0; i < total; i++) {
		const id1 = worldControlMap[i];
		if (id1 <= 0) continue;

		const x = i % gridWidth;
		const y = Math.floor(i / gridWidth);

		// Only check right and down to avoid redundant pairs
		const neighbors = [];
		if (x < gridWidth - 1) neighbors.push(i + 1);
		if (y < gridHeight - 1) neighbors.push(i + gridWidth);

		for (const nIdx of neighbors) {
			const id2 = worldControlMap[nIdx];
			if (id2 > 0 && id1 !== id2) {
				if (!adj.has(id1)) adj.set(id1, new Set());
				if (!adj.has(id2)) adj.set(id2, new Set());
				adj.get(id1).add(id2);
				adj.get(id2).add(id1);
			}
		}
	}
	return adj;
}

export function triggerRandomWar() {
	if (!randomWarMode) return;

	// Never start a random war while a major conflict is already simulating,
	// to avoid corrupting existing sides and soft‑locking the game.
	if (gameState === "SIMULATING" || gameState === "WAR_OVER") return;

	if (!adjacencyCache) adjacencyCache = computeAdjacency();

	// Pre‑compute tile counts so we only pick real countries with land
	const tileCounts = new Map();
	for (let i = 0; i < worldControlMap.length; i++) {
		const id = worldControlMap[i];
		if (id > 0) {
			tileCounts.set(id, (tileCounts.get(id) || 0) + 1);
		}
	}

	const currentCombatants = new Set(sides.flat().map((c) => c.id));
	const eligibleCountries = Array.from(adjacencyCache.keys()).filter(
		(id) => id > 0 && tileCounts.get(id) > 0 && !currentCombatants.has(id),
	);

	if (eligibleCountries.length < 2) return;

	// Try to find a VALID pair of neighbors (different ids, both real countries with adjacency)
	let idA = -1,
		idB = -1;
	const shuffledEligible = eligibleCountries
		.slice()
		.sort(() => Math.random() - 0.5);

	for (const candidateA of shuffledEligible) {
		const neighborsSet = adjacencyCache.get(candidateA);
		if (!neighborsSet || neighborsSet.size === 0) continue;

		const neighborIds = Array.from(neighborsSet).filter(
			(id) =>
				id > 0 &&
				id !== candidateA &&
				tileCounts.get(id) > 0 &&
				!currentCombatants.has(id),
		);
		if (neighborIds.length === 0) continue;

		idA = candidateA;
		idB = neighborIds[Math.floor(Math.random() * neighborIds.length)];
		break;
	}

	// If we couldn't find a safe, adjacent pair, abort the random war request
	if (idA <= 0 || idB <= 0 || idA === idB) return;

	const metaA = countryMetadata[idA - 1];
	const metaB = countryMetadata[idB - 1];
	if (!metaA || !metaB) return;

	const countryA = {
		id: idA,
		name: metaA.name,
		color: metaA.color,
		role: "OFFENSE",
		strategy: "BALANCED",
		buffState: "none",
	};
	const countryB = {
		id: idB,
		name: metaB.name,
		color: metaB.color,
		role: "OFFENSE",
		strategy: "BALANCED",
		buffState: "none",
	};

	// Random war from setup: start a clean two‑sided conflict using normal flow
	sides = [[countryA], [countryB]];
	activeSideIndex = 0;
	updateSidesUI();
	startWar();
}

/**
 * Show benchmark results modal with frame timing statistics.
 */
function showBenchmarkResults() {
	if (_perfSamples.length === 0) return;
	const avg = _perfSamples.reduce((a, b) => a + b, 0) / _perfSamples.length;
	const max = Math.max(..._perfSamples);
	const min = Math.min(..._perfSamples);
	const avgFps = 1000 / avg;
	const minFps = 1000 / max;
	const maxFps = 1000 / min;
	if (benchmarkStatsEl) {
		benchmarkStatsEl.innerHTML =
			`Frames: ${_perfSamples.length} &nbsp;|&nbsp; Speed: ${simSpeed}x<br>` +
			`Avg FPS: ${avgFps.toFixed(0)} &nbsp;|&nbsp; Min FPS: ${minFps.toFixed(0)} &nbsp;|&nbsp; Max FPS: ${maxFps.toFixed(0)}<br>` +
			`Avg frame: ${avg.toFixed(1)}ms &nbsp;|&nbsp; Max frame: ${max.toFixed(1)}ms &nbsp;|&nbsp; Min frame: ${min.toFixed(1)}ms`;
	}
	if (benchmarkResults) benchmarkResults.style.display = "flex";
}

/**
 * Benchmark mode: load Modern Day scenario, launch Russia vs China at max speed.
 * Auto-fetches the 2022 preset if the main menu is open with no data loaded yet.
 */
export async function startBenchmark() {
	// Load the 2022 Modern Day scenario if countryMetadata isn't populated yet
	if (!countryMetadata || countryMetadata.length === 0) {
		loadingStatus.innerText = "Loading Modern World Theater...";
		loadingOverlay.style.display = "flex";
		mainMenu.style.display = "none";
		try {
			const url = "assets/maps/world map 2022.json";
			const response = await fetch(url);
			if (!response.ok) throw new Error("Failed to fetch modern map");
			const blob = await response.blob();
			await performPresetLoad(blob, "CONQUEST");
		} catch (e) {
			console.error(e);
			alert("Failed to load 2022 Modern Day scenario.");
			return;
		}
	}

	// Match Russia and China by name (China may be "People's Republic of China")
	const metaRussia = countryMetadata.find((m) => m && m.name === "Russia");
	const metaChina = countryMetadata.find(
		(m) => m && typeof m.name === "string" && m.name.includes("China"),
	);
	if (!metaRussia || !metaChina) {
		alert("Russia or China not found in country data.");
		return;
	}

	const russia = {
		id: metaRussia.id,
		name: metaRussia.name,
		color: metaRussia.color,
		role: "OFFENSE",
		strategy: "BALANCED",
		buffState: "none",
	};
	const china = {
		id: metaChina.id,
		name: metaChina.name,
		color: metaChina.color,
		role: "OFFENSE",
		strategy: "BALANCED",
		buffState: "none",
	};

	sides = [[russia], [china]];
	activeSideIndex = 0;
	updateSidesUI();
	await startWar();
	// Crank to max speed for stress testing
	setSpeed(SPEED_STEPS.indexOf(5));
	// Initialize benchmark state
	isPaused = false;
	_perfSamples = [];
	_perfBenchmarkEnd = performance.now() + 60_000;
	_isBenchmarking = true;
}

export function activateCountryMidWar(country, sideIdx) {
	const countryId = country.id;

	units.forEach((u) => {
		if (u.sovereignId === countryId) {
			u.sideIndex = sideIdx;
			u.beneficiaryId = countryId;
			u.deployTicks = 15;
		}
	});

	let cellCount = 0;
	const theaterIndices = [];

	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === countryId) {
			landMask[i] = 2;
			// Don't erase enemy occupation if the cell is already under enemy control.
			// Otherwise the German army that already conquered Czechia would need to
			// re-propagate influence from scratch — taking hundreds of throttled ticks.
			const currentDs = dominantSideMap[i];
			if (currentDs < 0 || currentDs === sideIdx) {
				for (let s = 0; s < sideInfluenceMaps.length; s++)
					sideInfluenceMaps[s][i] = 0;
				sideInfluenceMaps[sideIdx][i] = 1.0;
				syncOccupationFromSideInfluence(i);
				primaryOccupierMap[i] = countryId;
			}
			theaterIndices.push(i);
			cellCount++;
		}
	}
	country.initialCells = cellCount;

	// Add cities of the new country to the active theater so they can be captured
	const newCities = cities.filter((c) => {
		const idx = getGridIndex(c.lat, c.lng);
		return idx !== -1 && worldControlMap[idx] === countryId;
	});
	activeTheaterCities = [...activeTheaterCities, ...newCities];

	const meta = countryMetadata.find((m) => m && m.id === countryId);
	if (meta?.tempFlag) {
		country.flag = meta.tempFlag;
	} else {
		country.flag = new Image();
		country.flag.crossOrigin = "anonymous";
		if (meta?.flagUrl) {
			country.flag.src = meta.flagUrl;
		}
		if (meta) meta.tempFlag = country.flag;
	}

	// Identify frontline cells for the intervening country for smart spawning
	const frontlines = [];
	theaterIndices.forEach((i) => {
		let isF = false;
		let vx = 0,
			vy = 0;
		const neighbors = [
			{ id: i + 1, dx: 1, dy: 0 },
			{ id: i - 1, dx: -1, dy: 0 },
			{ id: i + gridWidth, dx: 0, dy: 1 },
			{ id: i - gridWidth, dx: 0, dy: -1 },
		];
		for (const n of neighbors) {
			if (n.id >= 0 && n.id < worldControlMap.length) {
				const nId = worldControlMap[n.id];
				// A cell is a frontline if its neighbor belongs to an enemy side
				if (nId > 0 && nId !== countryId) {
					const nSide = sides.findIndex((s) => s.some((c) => c.id === nId));
					if (nSide !== -1 && nSide !== sideIdx) {
						isF = true;
						vx -= n.dx;
						vy -= n.dy;
					}
				}
			}
		}
		if (isF) {
			const mag = Math.sqrt(vx * vx + vy * vy);
			frontlines.push({
				idx: i,
				vx: mag > 0 ? vx / mag : 0,
				vy: mag > 0 ? vy / mag : 0,
			});
		}
	});

	const multiplier = parseFloat(densitySlider.value) || 1.0;

	// Diminishing Density: Large countries have lower unit density to prevent overcrowding
	const sizeFactor = Math.max(1, theaterIndices.length / 1500);
	const densityScale = 1.0 / sizeFactor ** 0.45;

	let count = Math.floor(
		theaterIndices.length *
			CONFIG.UNIT_DENSITY_FACTOR *
			multiplier *
			densityScale,
	);
	count = Math.max(4, Math.min(count, CONFIG.MAX_UNITS_PER_SIDE));

	for (let j = 0; j < count; j++) {
		let fData;
		let fromFront = false;
		if (frontlines.length > 0 && Math.random() < 0.95) {
			fData = frontlines[Math.floor(Math.random() * frontlines.length)];
			fromFront = true;
		} else {
			const idx =
				theaterIndices[Math.floor(Math.random() * theaterIndices.length)];
			fData = { idx, vx: 0, vy: 0 };
		}

		const y = Math.floor(fData.idx / gridWidth);
		const x = fData.idx % gridWidth;

		// Use pushback logic consistent with startWar for clean frontline deployment
		const pushBack = fromFront ? CONFIG.GRID_RES * 0.45 : 0;

		const spawnIdx = fData.idx;
		const isMountainCell = terrainMask && terrainMask[spawnIdx] > 0.35;
		const isAlpen = isMountainCell && Math.random() < 0.4;

		units.push({
			id: Math.random(),
			lat:
				y * CONFIG.GRID_RES -
				90 +
				(Math.random() - 0.5) * CONFIG.GRID_RES * 1.2 +
				fData.vy * pushBack,
			lng:
				x * CONFIG.GRID_RES -
				180 +
				(Math.random() - 0.5) * CONFIG.GRID_RES * 1.2 +
				fData.vx * pushBack,
			sideIndex: sideIdx,
			sovereignId: countryId,
			beneficiaryId: countryId,
			isAlpenjager: !!isAlpen,
			health: CONFIG.UNIT_HEALTH * (isAlpen ? CONFIG.ALPEN_HEALTH_MULT : 1),
			lastAttack: 0,
			deployTicks: 30,
		});
	}
	recalculateAllBounds();
}

export function launchBomb(fromLat, fromLng, toLat, toLng, sideIdx) {
	bombs.push({
		id: Math.random(),
		startLat: fromLat,
		startLng: fromLng,
		targetLat: toLat,
		targetLng: toLng,
		currentLat: fromLat,
		currentLng: fromLng,
		nextLat: fromLat,
		nextLng: fromLng,
		progress: 0,
		sideIndex: sideIdx,
		state: "rising",
		trail: [],
		peakAlt: 1.5 + Math.random() * 2.5,
	});
}

/**
 * Rebuild the global frontline direction field.
 * For every land cell, stores the unit-vector pointing toward the nearest
 * warzone cell whose |occupation| <= 0.25 (the "contested border band").
 * Uses a BFS / wave-front expansion so each cell is visited at most once — O(N).
 * Called at most once every FRONTLINE_FIELD_UPDATE_INTERVAL ticks.
 * All typed arrays are allocated once and reused to avoid GC pressure.
 */

/**
 * O(1) lookup: return direction from a unit's grid cell toward the nearest frontline.
 * Falls back to the old scan only if the field hasn't been built yet.
 */

export function assignFrontlineSlots() {
	if (!_frontlinePolys || Object.keys(_frontlinePolys).length === 0) return;

	// Build a map: sideIndex → list of side-pair keys this side participates in
	const sideFronts = {};
	for (let si = 0; si < sides.length; si++) {
		sideFronts[si] = [];
	}
	for (const key of Object.keys(_frontlinePolys)) {
		const [a, b] = key.split("_").map(Number);
		if (sideFronts[a]) sideFronts[a].push(key);
		if (sideFronts[b]) sideFronts[b].push(key);
	}

	// Collect ALL units per side for proportional multi-front distribution
	const allBySideFront = {};
	const sideUnits = {};
	for (let si = 0; si < sides.length; si++) {
		sideUnits[si] = [];
		allBySideFront[si] = {};
	}

	for (let ui = 0; ui < units.length; ui++) {
		const u = units[ui];
		if (u.deployTicks > 0) continue;
		const si = u.sideIndex;
		const fronts = sideFronts[si] || [];
		if (fronts.length > 0) sideUnits[si].push(u);
	}

	// Distribute units across fronts proportionally by polyline length,
	// with stickiness: units stay in their current front segment unless the
	// segment is over- or under-manned.
	for (let si = 0; si < sides.length; si++) {
		const fronts = sideFronts[si] || [];
		const allUnits = sideUnits[si] || [];
		if (fronts.length === 0 || allUnits.length === 0) continue;

		if (fronts.length === 1) {
			allBySideFront[si][fronts[0]] = allUnits;
			continue;
		}

		const frontLengths = {};
		let totalLen = 0;
		for (const key of fronts) {
			const len = _frontlinePolys[key]?.length || 0;
			frontLengths[key] = len;
			totalLen += len;
		}
		if (totalLen === 0) {
			for (const key of fronts) allBySideFront[si][key] = [];
			continue;
		}

		// Desired unit counts per front, proportional to polyline length
		const desired = {};
		let desiredSum = 0;
		for (const key of fronts) {
			desired[key] = Math.max(
				1,
				Math.floor((allUnits.length * frontLengths[key]) / totalLen),
			);
			desiredSum += desired[key];
		}
		// Distribute remainder to longest fronts
		const remainder = allUnits.length - desiredSum;
		const sortedFronts = [...fronts].sort(
			(a, b) => frontLengths[b] - frontLengths[a],
		);
		for (let ri = 0; ri < remainder; ri++) {
			desired[sortedFronts[ri % sortedFronts.length]]++;
		}

		// Sticky assignment: prefer keeping units in their current front segment
		const sticky = {};
		for (const key of fronts) sticky[key] = [];
		const leftovers = [];

		for (const u of allUnits) {
			const prevKey = u.frontSlot?.pairKey;
			if (
				prevKey &&
				sticky[prevKey] &&
				sticky[prevKey].length < desired[prevKey]
			) {
				sticky[prevKey].push(u);
			} else {
				leftovers.push(u);
			}
		}

		// Fill remaining slots from leftovers
		for (const key of fronts) {
			const needed = desired[key] - sticky[key].length;
			if (!allBySideFront[si][key]) allBySideFront[si][key] = [];
			for (const u of sticky[key]) allBySideFront[si][key].push(u);
			for (let i = 0; i < needed && leftovers.length > 0; i++) {
				allBySideFront[si][key].push(leftovers.shift());
			}
		}
	}

	// Proportional distribution: spread ALL units evenly along each frontline polyline
	for (let si = 0; si < sides.length; si++) {
		const frontMap = allBySideFront[si] || {};
		for (const pairKey of Object.keys(frontMap)) {
			const unitList = frontMap[pairKey];
			const poly = _frontlinePolys[pairKey];
			if (!poly || unitList.length === 0 || poly.length === 0) continue;

			// Sort by current slot index to preserve relative front position while spreading
			unitList.sort(
				(a, b) =>
					(a.frontSlot?.segmentIdx || 0) - (b.frontSlot?.segmentIdx || 0),
			);

			const n = unitList.length;
			const step = Math.max(1, Math.floor(poly.length / n));

			for (let i = 0; i < n; i++) {
				const u = unitList[i];
				const idx = Math.min(poly.length - 1, Math.floor(i * step));
				u.frontSlot = {
					pairKey,
					segmentIdx: idx,
					targetLat: poly[idx].lat,
					targetLng: poly[idx].lng,
				};
			}
		}
	}
}

/**
 * Assign proportional slots to garrison units along neutral border polylines
 * so they spread evenly instead of clustering at cities.
 */
/**
 * Proposal Engine: generate every possible plan candidate for a side.
 * Returns an array of lightweight proposal objects — no plan objects created yet.
 * @param {number} sideIdx
 * @returns {Array<Object>}
 */
export function generateAllProposals(sideIdx) {
	const proposals = [];
	const sideCountries = sides[sideIdx] || [];
	if (sideCountries.length === 0) return proposals;

	const sideUnits = _tickUnitsBySide[sideIdx] || [];
	const unitCount = sideUnits.filter((u) => u.deployTicks === 0).length;
	if (unitCount < 3) return proposals;

	const myAllyIds = new Set(sideCountries.map((c) => c.id));

	// ── Pre-compute shared data ──

	// Friendly unit centroid
	let uLat = 0,
		uLng = 0,
		uCount = 0;
	for (let ui = 0; ui < units.length; ui++) {
		const u = units[ui];
		if (u.sideIndex !== sideIdx || u.deployTicks > 0) continue;
		uLat += u.lat;
		uLng += u.lng;
		uCount++;
	}
	if (uCount > 0) {
		uLat /= uCount;
		uLng /= uCount;
	}

	// Enemy territory centroid
	let eLat = 0,
		eLng = 0,
		eCount = 0;
	for (let i = 0; i < dominantSideMap.length; i += 20) {
		if (landMask[i] === 0) continue;
		if (dominantSideMap[i] !== sideIdx && dominantSideMap[i] >= 0) {
			const row = Math.floor(i / gridWidth);
			const col = i % gridWidth;
			eLat += row * CONFIG.GRID_RES - 90;
			eLng += col * CONFIG.GRID_RES - 180;
			eCount++;
		}
	}
	if (eCount > 0) {
		eLat /= eCount;
		eLng /= eCount;
	}

	// Friendly coastal staging cells (for naval proposals)
	const friendlyCoastCells = [];
	const sampledFriendly = new Set();
	for (let gi = 0; gi < landMask.length; gi += 3) {
		if (landMask[gi] === 0) continue;
		if (dominantSideMap[gi] !== sideIdx) continue;
		const row = Math.floor(gi / gridWidth);
		const col = gi % gridWidth;
		let isCoastal = false;
		for (let dr = -1; dr <= 1 && !isCoastal; dr++) {
			for (let dc = -1; dc <= 1 && !isCoastal; dc++) {
				if (dr === 0 && dc === 0) continue;
				const nr = row + dr;
				const nc = col + dc;
				if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth) continue;
				if (landMask[nr * gridWidth + nc] === 0) isCoastal = true;
			}
		}
		if (!isCoastal) continue;
		const lat = row * CONFIG.GRID_RES - 90;
		const lng = col * CONFIG.GRID_RES - 180;
		const key = `${Math.floor(lat)}_${Math.floor(lng)}`;
		if (sampledFriendly.has(key)) continue;
		sampledFriendly.add(key);
		friendlyCoastCells.push({ lat, lng, idx: gi });
	}

	// Enemy coastal tiles (for naval and coastal defense)
	const enemyCoastalTiles = [];
	const sampledEnemy = new Set();
	for (let gi = 0; gi < landMask.length; gi += 2) {
		if (landMask[gi] === 0) continue;
		if (dominantSideMap[gi] === sideIdx) continue;
		const cellOwnerId = worldControlMap[gi];
		const ownerSide = _tickCountryToSideMap.get(cellOwnerId);
		if (ownerSide === sideIdx || ownerSide === undefined) continue;
		if (myAllyIds.has(cellOwnerId)) continue;
		const row = Math.floor(gi / gridWidth);
		const col = gi % gridWidth;
		let isCoastal = false;
		for (let dr = -1; dr <= 1 && !isCoastal; dr++) {
			for (let dc = -1; dc <= 1 && !isCoastal; dc++) {
				if (dr === 0 && dc === 0) continue;
				const nr = row + dr;
				const nc = col + dc;
				if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth) continue;
				if (landMask[nr * gridWidth + nc] === 0) isCoastal = true;
			}
		}
		if (!isCoastal) continue;
		const lat = row * CONFIG.GRID_RES - 90;
		const lng = col * CONFIG.GRID_RES - 180;
		const key = `${Math.floor(lat)}_${Math.floor(lng)}`;
		if (sampledEnemy.has(key)) continue;
		sampledEnemy.add(key);
		enemyCoastalTiles.push({ lat, lng, idx: gi });
	}

	// Check if this side has any land connection to enemies
	let hasLandConnection = false;
	if (_frontlinePolys) {
		for (const key of Object.keys(_frontlinePolys)) {
			const [a, b] = key.split("_").map(Number);
			if (a === sideIdx || b === sideIdx) {
				if (_frontlinePolys[key]?.length > 0) {
					hasLandConnection = true;
					break;
				}
			}
		}
	}

	// ── 1. CAPTURE_CITY proposals ──
	const enemyCities = [];
	for (let ci = 0; ci < activeTheaterCities.length; ci++) {
		const city = activeTheaterCities[ci];
		const cIdx = getGridIndex(city.lat, city.lng);
		if (cIdx === -1) continue;
		const ownerId = city.ownerId || 0;
		if (myAllyIds.has(ownerId)) continue;
		if (dominantSideMap[cIdx] === sideIdx) continue;
		enemyCities.push({
			city,
			isCapital: city.isCapital || false,
			idx: cIdx,
		});
	}

	// Find frontline centroid for distance reference
	let fLat = 0,
		fLng = 0,
		fCount = 0;
	if (_frontlinePolys) {
		for (const key of Object.keys(_frontlinePolys)) {
			const [a, b] = key.split("_").map(Number);
			if (a !== sideIdx && b !== sideIdx) continue;
			const poly = _frontlinePolys[key];
			if (!poly) continue;
			const stride = Math.max(1, Math.floor(poly.length / 20));
			for (let p = 0; p < poly.length; p += stride) {
				fLat += poly[p].lat;
				fLng += poly[p].lng;
				fCount++;
			}
		}
	}
	if (fCount > 0) {
		fLat /= fCount;
		fLng /= fCount;
	}

	for (const ec of enemyCities) {
		// Score proximity to frontline
		let deLng = ec.city.lng - fLng;
		if (deLng > 180) deLng -= 360;
		else if (deLng < -180) deLng += 360;
		const dSq = (ec.city.lat - fLat) ** 2 + deLng ** 2;

		// Water-crossing check: sample line from unit centroid to city
		let crossesWater = false;
		if (uCount > 0 && !hasLandConnection) {
			const ddLat = ec.city.lat - uLat;
			let ddLng = ec.city.lng - uLng;
			if (ddLng > 180) ddLng -= 360;
			else if (ddLng < -180) ddLng += 360;
			const lineLen = Math.sqrt(ddLat * ddLat + ddLng * ddLng);
			if (lineLen > 0.5) {
				const steps = Math.min(20, Math.ceil(lineLen / 0.3));
				let waterSamples = 0;
				for (let s = 1; s < steps; s++) {
					const t = s / steps;
					const slat = uLat + ddLat * t;
					const slng = uLng + ddLng * t;
					const sIdx = getGridIndex(slat, slng);
					if (sIdx !== -1 && landMask[sIdx] === 0) waterSamples++;
				}
				if (waterSamples > steps * 0.4) crossesWater = true;
			}
		}

		proposals.push({
			type: "CAPTURE_CITY",
			target: {
				lat: ec.city.lat,
				lng: ec.city.lng,
				name: ec.city.name || "Enemy City",
				isCapital: ec.isCapital,
			},
			stagingCells: [],
			arrowPoints:
				uCount > 0 && eCount > 0
					? [
							{ lat: uLat, lng: uLng },
							{ lat: ec.city.lat, lng: ec.city.lng },
						]
					: null,
			estimatedForceNeeded: Math.ceil(unitCount * 0.15),
			geographicData: {
				frontlineDistSq: dSq,
				reachesTarget: !crossesWater,
				minSeaDist: Infinity,
				minLandDist: Math.sqrt(dSq || 1),
			},
		});
	}

	// ── 2. ENCIRCLE proposals ──
	const frontlineKeys = Object.keys(_frontlinePolys || {});
	for (const key of frontlineKeys) {
		const [a, b] = key.split("_").map(Number);
		if (a !== sideIdx && b !== sideIdx) continue;
		const poly = _frontlinePolys[key];
		if (!poly || poly.length < 5) continue;

		const stride = Math.max(1, Math.floor(poly.length / 20));
		for (let ci = 0; ci < Math.min(500, poly.length); ci += stride) {
			const cell = poly[ci];
			let friendlyCount = 0,
				enemyCount = 0;
			const radSq = 1.0;

			for (let ui = 0; ui < units.length; ui++) {
				const other = units[ui];
				if (other.deployTicks > 0) continue;
				const dLat2 = other.lat - cell.lat;
				let dLng2 = other.lng - cell.lng;
				if (dLng2 > 180) dLng2 -= 360;
				else if (dLng2 < -180) dLng2 += 360;
				if (dLat2 * dLat2 + dLng2 * dLng2 > radSq) continue;
				if (other.sideIndex === sideIdx) friendlyCount++;
				else enemyCount++;
			}

			if (enemyCount >= 2 && friendlyCount >= enemyCount * 3) {
				proposals.push({
					type: "ENCIRCLE",
					target: {
						lat: cell.lat,
						lng: cell.lng,
						name: "Encirclement Pocket",
						isCapital: false,
					},
					stagingCells: [],
					arrowPoints: [
						{ lat: cell.lat, lng: cell.lng },
						{ lat: cell.lat, lng: cell.lng },
					],
					estimatedForceNeeded: Math.ceil(unitCount * 0.3),
					geographicData: {
						frontlineDistSq: 1,
						reachesTarget: true,
						minSeaDist: Infinity,
						minLandDist: 1,
					},
				});
				break;
			}
		}
	}

	// ── 3. PUSH_FRONT proposal ──
	if (uCount > 0 && eCount > 0) {
		proposals.push({
			type: "PUSH_FRONT",
			target: null,
			stagingCells: [],
			arrowPoints: [
				{ lat: uLat, lng: uLng },
				{ lat: eLat, lng: eLng },
			],
			estimatedForceNeeded: Math.ceil(unitCount * 0.5),
			geographicData: {
				frontlineDistSq: 0,
				reachesTarget: hasLandConnection,
				minSeaDist: Infinity,
				minLandDist: 0,
			},
		});
	}

	// ── 4. DEFEND proposal ──
	const flPts = [];
	if (_frontlinePolys) {
		for (const key of frontlineKeys) {
			const [a, b] = key.split("_").map(Number);
			if (a !== sideIdx && b !== sideIdx) continue;
			const poly = _frontlinePolys[key];
			if (!poly) continue;
			const pStride = Math.max(1, Math.floor(poly.length / 60));
			for (let p = 0; p < poly.length; p += pStride) {
				flPts.push({ lat: poly[p].lat, lng: poly[p].lng });
			}
		}
	}
	proposals.push({
		type: "DEFEND",
		target: null,
		stagingCells: [],
		arrowPoints: null,
		frontlinePoints: flPts,
		estimatedForceNeeded: Math.ceil(unitCount * 0.3),
		geographicData: {
			frontlineDistSq: 0,
			reachesTarget: true,
			minSeaDist: Infinity,
			minLandDist: 0,
		},
	});

	// ── 5. NAVAL_INVASION proposals ──
		// Only propose naval invasions if enough units are near the coast
		let _coastalUnitCount = 0;
		for (let _cui = 0; _cui < (_tickUnitsBySide[sideIdx] || []).length; _cui++) {
			const _cu = _tickUnitsBySide[sideIdx][_cui];
			if (_cu.deployTicks > 0) continue;
			for (let _fci = 0; _fci < friendlyCoastCells.length; _fci++) {
				const _dLat = _cu.lat - friendlyCoastCells[_fci].lat;
				let _dLng = _cu.lng - friendlyCoastCells[_fci].lng;
				if (_dLng > 180) _dLng -= 360;
				else if (_dLng < -180) _dLng += 360;
				if (_dLat * _dLat + _dLng * _dLng < 9.0) { _coastalUnitCount++; break; }
			}
		}

		if (friendlyCoastCells.length > 0 && enemyCoastalTiles.length > 0 && _coastalUnitCount >= 5) {
		for (const et of enemyCoastalTiles) {
			let minSeaDist = Infinity;
			let minLandDist = Infinity;
			for (const fc of friendlyCoastCells) {
				const dLat2 = et.lat - fc.lat;
				let dLng2 = et.lng - fc.lng;
				if (dLng2 > 180) dLng2 -= 360;
				else if (dLng2 < -180) dLng2 += 360;
				const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
				if (dSq2 < minSeaDist) minSeaDist = dSq2;
			}
			if (_frontlinePolys) {
				for (const key of frontlineKeys) {
					const [a, b] = key.split("_").map(Number);
					if (a !== sideIdx && b !== sideIdx) continue;
					const poly = _frontlinePolys[key];
					if (!poly) continue;
					for (
						let p = 0;
						p < poly.length;
						p += Math.max(1, Math.floor(poly.length / 10))
					) {
						const dLat2 = et.lat - poly[p].lat;
						let dLng2 = et.lng - poly[p].lng;
						if (dLng2 > 180) dLng2 -= 360;
						else if (dLng2 < -180) dLng2 += 360;
						const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
						if (dSq2 < minLandDist) minLandDist = dSq2;
					}
				}
			}
			if (minSeaDist > 400 || minSeaDist < 4.0) continue;
			if (minLandDist < 0.1) continue;

			// Find closest friendly coast as staging point
			let bestStaging = null;
			let bestStagingDist = Infinity;
			for (const fc of friendlyCoastCells) {
				const dLat2 = et.lat - fc.lat;
				let dLng2 = et.lng - fc.lng;
				if (dLng2 > 180) dLng2 -= 360;
				else if (dLng2 < -180) dLng2 += 360;
				const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
				if (dSq2 < bestStagingDist) {
					bestStagingDist = dSq2;
					bestStaging = fc;
				}
			}
			if (!bestStaging) continue;

			proposals.push({
				type: "NAVAL_INVASION",
				target: {
					lat: et.lat,
					lng: et.lng,
					name: "Enemy Coast",
					isCapital: false,
				},
				stagingPoint: { lat: bestStaging.lat, lng: bestStaging.lng },
				arrowPoints: [
					{ lat: bestStaging.lat, lng: bestStaging.lng },
					{ lat: et.lat, lng: et.lng },
				],
				estimatedForceNeeded: Math.ceil(unitCount * 0.15),
				geographicData: {
					frontlineDistSq: 0,
					reachesTarget: true,
					minSeaDist,
					minLandDist,
				},
			});
		}
	}

	// ── 6. NAVAL_SUPPLY proposal ──
	if (_navalPlan[sideIdx]?.phase === "LANDING") {
		const np = _navalPlan[sideIdx];
		let bestStaging = null;
		let bestStagingDist = Infinity;
		for (const fc of friendlyCoastCells) {
			const dLat2 = np.target.lat - fc.lat;
			let dLng2 = np.target.lng - fc.lng;
			if (dLng2 > 180) dLng2 -= 360;
			else if (dLng2 < -180) dLng2 += 360;
			const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
			if (dSq2 < bestStagingDist) {
				bestStagingDist = dSq2;
				bestStaging = fc;
			}
		}
		if (bestStaging && bestStagingDist <= 400) {
			proposals.push({
				type: "NAVAL_SUPPLY",
				target: {
					lat: np.target.lat,
					lng: np.target.lng,
					name: np.target.name || "Supply Target",
					isCapital: false,
				},
				stagingPoint: { lat: bestStaging.lat, lng: bestStaging.lng },
				arrowPoints: [
					{ lat: bestStaging.lat, lng: bestStaging.lng },
					{ lat: np.target.lat, lng: np.target.lng },
				],
				estimatedForceNeeded: Math.ceil(unitCount * 0.1),
				geographicData: {
					frontlineDistSq: 0,
					reachesTarget: true,
					minSeaDist: bestStagingDist,
					minLandDist: 0,
				},
			});
		}
	}

	// ── 7. COASTAL_DEFENSE proposals ──
	if (friendlyCoastCells.length > 0 && enemyCoastalTiles.length > 0) {
		// Cluster friendly coast cells into contiguous zones
		for (const fc of friendlyCoastCells) {
			fc._visited = false;
		}
		const coastalZones = [];
		for (const seed of friendlyCoastCells) {
			if (seed._visited) continue;
			const zone = [seed];
			seed._visited = true;
			for (let zi = 0; zi < zone.length; zi++) {
				for (const other of friendlyCoastCells) {
					if (other._visited) continue;
					const dLat2 = zone[zi].lat - other.lat;
					let dLng2 = zone[zi].lng - other.lng;
					if (dLng2 > 180) dLng2 -= 360;
					else if (dLng2 < -180) dLng2 += 360;
					if (dLat2 * dLat2 + dLng2 * dLng2 < 4.0) {
						other._visited = true;
						zone.push(other);
					}
				}
			}
			coastalZones.push(zone);
		}
		for (const fc of friendlyCoastCells) {
			delete fc._visited;
		}

		for (const zone of coastalZones) {
			let zLat = 0,
				zLng = 0;
			for (const cell of zone) {
				zLat += cell.lat;
				zLng += cell.lng;
			}
			zLat /= zone.length;
			zLng /= zone.length;

			let threatScore = 0;
			for (const et of enemyCoastalTiles) {
				const dLat2 = zLat - et.lat;
				let dLng2 = zLng - et.lng;
				if (dLng2 > 180) dLng2 -= 360;
				else if (dLng2 < -180) dLng2 += 360;
				const dSq2 = dLat2 * dLat2 + dLng2 * dLng2;
				if (dSq2 < 400) threatScore++;
			}
			threatScore = Math.min(1, threatScore / 50);

			let enemyNavalThreat = 0;
			for (let ei = 0; ei < sides.length; ei++) {
				if (ei === sideIdx) continue;
				const enp = _navalPlan[ei];
				if (enp?.phase && enp.target) {
					const dLat2 = zLat - enp.target.lat;
					let dLng2 = zLng - enp.target.lng;
					if (dLng2 > 180) dLng2 -= 360;
					else if (dLng2 < -180) dLng2 += 360;
					if (dLat2 * dLat2 + dLng2 * dLng2 < 100) {
						enemyNavalThreat += 0.3;
					}
				}
			}

			const zonePolyline = zone.map((c) => ({ lat: c.lat, lng: c.lng }));
			proposals.push({
				type: "COASTAL_DEFENSE",
				target: { lat: zLat, lng: zLng, name: "Coastal Zone" },
				stagingCells: [],
				arrowPoints: null,
				zonePolyline,
				estimatedForceNeeded: Math.ceil(
					zone.length * 0.8 * (threatScore + 0.2),
				),
				threatScore: Math.min(1, threatScore + enemyNavalThreat),
				geographicData: {
					frontlineDistSq: 0,
					reachesTarget: true,
					minSeaDist: 0,
					minLandDist: 0,
				},
			});
		}
	}

	// ── 8. NEUTRAL_GARRISON proposals ──
	if (adjacencyCache) {
		// Build sovereign unit count map for threat estimation
		const sovUnitCounts = new Map();
		for (const uu of units) {
			if (uu.deployTicks > 0) continue;
			sovUnitCounts.set(
				uu.sovereignId,
				(sovUnitCounts.get(uu.sovereignId) || 0) + 1,
			);
		}
		for (const [countryId, neighbors] of adjacencyCache.entries()) {
			if (!myAllyIds.has(countryId)) continue;
			for (const nId of neighbors) {
				const nSide = _tickCountryToSideMap.get(nId);
				if (nSide !== undefined) continue;
				if (myAllyIds.has(nId)) continue;

				const alreadyProposed = proposals.some(
					(p) => p.type === "NEUTRAL_GARRISON" && p.neutralCountryId === nId,
				);
				if (alreadyProposed) continue;

				const neutralUnitCount = sovUnitCounts.get(nId) || 0;
				const estimatedThreat = Math.max(5, Math.ceil(neutralUnitCount * 0.3));

				proposals.push({
					type: "NEUTRAL_GARRISON",
					target: {
						lat: 0,
						lng: 0,
						name: `Neutral Border #${nId}`,
					},
					stagingCells: [],
					arrowPoints: null,
					neutralCountryId: nId,
					combatantCountryId: countryId,
					borderLength: _neutralBorderPolys[countryId]?.length || 0,
					estimatedForceNeeded: Math.min(
						Math.ceil(unitCount * 0.25),
						estimatedThreat,
					),
					geographicData: {
						frontlineDistSq: 0,
						reachesTarget: true,
						minSeaDist: Infinity,
						minLandDist: 0,
					},
				});
			}
		}
	}

	return proposals;
}
/**
 * Score a proposal based on strategic value, feasibility, risk, urgency,
 * and posture/strategy alignment. Returns a numeric priority score.
 * @param {Object} proposal - proposal from generateAllProposals
 * @param {number} sideIdx
 * @returns {number} priority score
 */
export function scoreProposal(proposal, sideIdx) {
	const sideCountries = sides[sideIdx] || [];
	const strategy = (sideCountries[0]?.strategy || "BALANCED").toUpperCase();
	const sideUnits = _tickUnitsBySide[sideIdx] || [];
	const unitCount = sideUnits.filter((u) => u.deployTicks === 0).length;
	const enemyUnitCount = units.filter(
		(u) => u.sideIndex !== sideIdx && u.deployTicks === 0 && u.health > 0,
	).length;
	const globalForceRatio = unitCount / Math.max(1, enemyUnitCount);
	const geo = proposal.geographicData || {};
	let score = 0;

	// ── Strategic Value (0–40) ──
	if (proposal.type === "CAPTURE_CITY") {
		if (proposal.target?.isCapital) score += 30;
		else score += 10;
		score += Math.sqrt(Math.max(0, geo.minLandDist || 0)) * 3;
	}
	if (proposal.type === "NAVAL_INVASION") {
		score += Math.sqrt(Math.max(0, geo.minLandDist || 0)) * 3;
		const seaDist = Math.sqrt(geo.minSeaDist || 1);
		if (seaDist > 3 && seaDist < 20) score += 15;
	}
	if (proposal.type === "COASTAL_DEFENSE") {
		score += (proposal.threatScore || 0) * 25;
	}
	if (proposal.type === "NEUTRAL_GARRISON") {
		score += Math.min(20, (proposal.borderLength || 0) * 0.3);
	}
	if (proposal.type === "DEFEND") {
		score += 10;
		if (globalForceRatio < 1.0) score += 15;
	}
	if (proposal.type === "ENCIRCLE") {
		score += 25;
	}
	if (proposal.type === "PUSH_FRONT") {
		score += 5;
	}
	if (proposal.type === "NAVAL_SUPPLY") {
		score += 20;
	}

	// ── Feasibility (0–30) ──
	if (globalForceRatio >= 2.0) score += 20;
	else if (globalForceRatio >= 1.0) score += 10;
	else score -= 15;

	if (geo.reachesTarget) score += 10;
	else score -= 30;

	// ── Risk (0–20, inverted) ──
	if (globalForceRatio >= 3.0) score += 20;
	else if (globalForceRatio >= 1.5) score += 10;
	else score -= 20;

	// ── Urgency (0–10) ──
	// Enemy naval landing on our territory boosts COASTAL_DEFENSE
	let enemyLandedOnUs = false;
	for (let ei = 0; ei < sides.length; ei++) {
		if (ei === sideIdx) continue;
		const enp = _navalPlan[ei];
		if (enp?.phase === "LANDING" && enp.target) {
			const tIdx = getGridIndex(enp.target.lat, enp.target.lng);
			if (tIdx !== -1 && dominantSideMap[tIdx] === sideIdx) {
				enemyLandedOnUs = true;
				break;
			}
		}
	}
	if (enemyLandedOnUs && proposal.type === "COASTAL_DEFENSE") {
		score += 20;
	}

	// ── Posture / Strategy alignment multiplier ──
	const isOffensive = [
		"CAPTURE_CITY",
		"ENCIRCLE",
		"PUSH_FRONT",
		"NAVAL_INVASION",
	].includes(proposal.type);
	const isDefensive = [
		"DEFEND",
		"COASTAL_DEFENSE",
		"NEUTRAL_GARRISON",
	].includes(proposal.type);

	const multipliers = {
		AGGRESSIVE: { offensive: 1.3, defensive: 0.5 },
		BLITZ: { offensive: 1.4, defensive: 0.4 },
		BALANCED: { offensive: 1.0, defensive: 1.0 },
		DEFENSIVE: { offensive: 0.4, defensive: 1.4 },
		URBAN: { offensive: 1.1, defensive: 0.9 },
	};
	const mult = multipliers[strategy] || multipliers.BALANCED;
	if (isOffensive) score *= mult.offensive;
	else if (isDefensive) score *= mult.defensive;

	// ── Special modifiers ──
	if (proposal.type === "CAPTURE_CITY" && !geo.reachesTarget) {
		score *= 0.1;
	}
	// Boost naval proposals when no land connection exists
	if (!_frontlinePolys || Object.keys(_frontlinePolys).length === 0) {
		if (
			isOffensive &&
			proposal.type !== "CAPTURE_CITY" &&
			proposal.type !== "ENCIRCLE"
		) {
			score *= 1.3;
		}
	}

	return Math.round(score * 100) / 100;
}
/**
 * Select the best plans from scored proposals, allocate forces, and
 * create actual war plan objects. Returns array of created plan entries.
 * @param {number} sideIdx
 * @param {Array<Object>} scoredProposals - proposals with priority scores
 * @returns {Object} { land1, land2, naval, supply, defend, coastal, garrisons }
 */
export function selectPlans(sideIdx, scoredProposals) {
	if (!scoredProposals || scoredProposals.length === 0) return {};

	const sideCountries = sides[sideIdx] || [];
	const strategy = (sideCountries[0]?.strategy || "BALANCED").toUpperCase();
	const sideUnits = _tickUnitsBySide[sideIdx] || [];
	const unitCount = sideUnits.filter((u) => u.deployTicks === 0).length;

	// Force allocation by strategy
	const alloc = {
		AGGRESSIVE: { offense: 0.75, defense: 0.2, reserve: 0.05 },
		BLITZ: { offense: 0.85, defense: 0.1, reserve: 0.05 },
		BALANCED: { offense: 0.5, defense: 0.4, reserve: 0.1 },
		DEFENSIVE: { offense: 0.25, defense: 0.65, reserve: 0.1 },
		URBAN: { offense: 0.55, defense: 0.35, reserve: 0.1 },
	}[strategy] || { offense: 0.5, defense: 0.4, reserve: 0.1 };

	const totalForce = Math.max(1, unitCount);
	const offensiveForce = Math.floor(totalForce * alloc.offense);
	const defensiveForce = Math.floor(totalForce * alloc.defense);

	// Sort by priority descending
	const sorted = [...scoredProposals].sort(
		(a, b) => (b.priority || 0) - (a.priority || 0),
	);

	// Group proposals by type
	const offensives = sorted.filter(
		(p) =>
			["CAPTURE_CITY", "ENCIRCLE", "PUSH_FRONT"].includes(p.type) &&
			(p.priority || 0) > 0,
	);
	const navals = sorted.filter(
		(p) => p.type === "NAVAL_INVASION" && (p.priority || 0) > 0,
	);
	const supplies = sorted.filter(
		(p) => p.type === "NAVAL_SUPPLY" && (p.priority || 0) > 0,
	);
	const defs = sorted.filter(
		(p) => p.type === "DEFEND" && (p.priority || 0) > 0,
	);
	const coastals = sorted.filter(
		(p) => p.type === "COASTAL_DEFENSE" && (p.priority || 0) > 0,
	);
	const garrisons = sorted.filter(
		(p) => p.type === "NEUTRAL_GARRISON" && (p.priority || 0) > 0,
	);

	const result = {};

	// ── Land offensive slot 1 ──
	const land1 = offensives[0];
	// ── Land offensive slot 2 ──
	let land2 = null;
	if (offensives.length > 1) {
		const second = offensives[1];
		if (land1 && (second.priority || 0) >= (land1.priority || 1) * 0.6) {
			// Check direction conflict
			if (
				land1.target &&
				second.target &&
				land1.arrowPoints &&
				second.arrowPoints
			) {
				const d1Lat = land1.target.lat - land1.arrowPoints[0].lat;
				let d1Lng = land1.target.lng - land1.arrowPoints[0].lng;
				const d2Lat = second.target.lat - second.arrowPoints[0].lat;
				let d2Lng = second.target.lng - second.arrowPoints[0].lng;
				if (d1Lng > 180) d1Lng -= 360;
				else if (d1Lng < -180) d1Lng += 360;
				if (d2Lng > 180) d2Lng -= 360;
				else if (d2Lng < -180) d2Lng += 360;
				const m1 = Math.sqrt(d1Lat * d1Lat + d1Lng * d1Lng);
				const m2 = Math.sqrt(d2Lat * d2Lat + d2Lng * d2Lng);
				const dot =
					m1 > 0 && m2 > 0 ? (d1Lat * d2Lat + d1Lng * d2Lng) / (m1 * m2) : 0;
				if (dot <= 0.7) land2 = second;
			} else {
				land2 = second;
			}
		}
	}

	// ── Naval invasion slot ──
	const naval1 = navals[0];

	// ── Supply slot ──
	const supply1 = supplies[0];

	// ── Defensive slot ──
	const defend1 = defs[0];

	// ── Coastal defense zones ──
	const selectedCoastal = coastals.filter((p) => (p.threatScore || 0) >= 0.1);

	// ── Neutral garrisons ──
	const selectedGarr = garrisons;

	// ── Force allocation ──
	const selectedOff = [land1, land2, naval1, supply1].filter(Boolean);
	const offSum = selectedOff.reduce((s, p) => s + (p.priority || 0), 0);
	for (const p of selectedOff) {
		p.allocatedForce =
			offSum > 0 ? Math.ceil(offensiveForce * ((p.priority || 0) / offSum)) : 0;
	}

	const selectedDef = [defend1, ...selectedCoastal, ...selectedGarr].filter(
		Boolean,
	);
	const defSum = selectedDef.reduce((s, p) => s + (p.priority || 0), 0);
	for (const p of selectedDef) {
		p.allocatedForce =
			defSum > 0 ? Math.ceil(defensiveForce * ((p.priority || 0) / defSum)) : 0;
	}
	// Ensure minimum force
	for (const p of selectedOff) {
		if (p.allocatedForce < 3) p.allocatedForce = Math.min(3, offensiveForce);
	}
	for (const p of selectedDef) {
		if (p.allocatedForce < 3) p.allocatedForce = Math.min(3, defensiveForce);
	}

	// ── Convert to plan objects ──
	const makePlan = (p, phase) => ({
		type: p.type,
		phase,
		target: p.target || null,
		stagingCells: p.stagingCells || [],
		arrowPoints: p.arrowPoints || null,
		frontlinePoints: p.frontlinePoints || null,
		stagingPoint: p.stagingPoint || null,
		zonePolyline: p.zonePolyline || null,
		borderPolyline:
			p.combatantCountryId != null
				? _neutralBorderPolys[p.combatantCountryId] || null
				: null,
		neutralCountryId: p.neutralCountryId || null,
		startedTick: simFrameCount,
		lastProgressTick: simFrameCount,
		progress: 0,
		maxAssignedUnits: p.allocatedForce || 5,
		activeUnitCount: 0,
	});

	if (land1) result.land1 = makePlan(land1, "PREPARATION");
	if (land2) result.land2 = makePlan(land2, "PREPARATION");
	if (naval1) result.naval = makePlan(naval1, "GATHERING");
	if (supply1) result.supply = makePlan(supply1, "GATHERING");
	if (defend1) result.defend = makePlan(defend1, "PREPARATION");
	result.coastal = selectedCoastal.map((p) => makePlan(p, "EXECUTION"));
	result.garrisons = selectedGarr.map((p) => makePlan(p, "EXECUTION"));

	return result;
}

function shouldReassess(si) {
	const REASSESS_INTERVAL = 300;
	const lastReassess = _proposalReassessTick[si] || 0;
	let result = false;

	if (_planReassessNeeded[si]) result = true;
	if (simFrameCount - lastReassess >= REASSESS_INTERVAL) result = true;
	if (!_warPlan[si]) result = true;

	// Territory change >2%
	const sideCountries = sides[si];
	if (sideCountries) {
		let cur = 0;
		for (const c of sideCountries) {
			const stats = latestCountryStats.get(c.id);
			if (stats) cur += stats.controlled || 0;
		}
		const prev = _sidePrevControlled[si] || 0;
		if (!result && prev > 0 && Math.abs(cur - prev) / Math.max(1, cur) > 0.02) {
			result = true;
		}
		_sidePrevControlled[si] = cur;
	}

	// Posture change
	const curPosture = _sidePosture[si] || "BALANCED";
	const prevPosture = _sidePrevPosture[si];
	if (!result && prevPosture !== undefined && prevPosture !== curPosture) {
		result = true;
	}
	_sidePrevPosture[si] = curPosture;

	// Force ratio change >20%
	const ourUnits = _tickUnitsBySide[si] ? _tickUnitsBySide[si].length : 0;
	let totalEnemyUnits = 0;
	for (let ei = 0; ei < sides.length; ei++) {
		if (ei === si) continue;
		if (!sides[ei] || sides[ei].length === 0) continue;
		totalEnemyUnits += _tickUnitsBySide[ei] ? _tickUnitsBySide[ei].length : 0;
	}
	const curRatio = totalEnemyUnits > 0 ? ourUnits / totalEnemyUnits : Infinity;
	const prevRatio = _sidePrevStrengthRatio[si];
	if (
		!result &&
		prevRatio !== undefined &&
		prevRatio > 0 &&
		Number.isFinite(curRatio)
	) {
		if (Math.abs(curRatio - prevRatio) / Math.max(0.01, prevRatio) > 0.2) {
			result = true;
		}
	}
	_sidePrevStrengthRatio[si] = curRatio;

	return result;
}

export function evaluateAllPlans() {
	// ── Reassessment: run the proposal pipeline when triggers fire ──
	for (let si = 0; si < sides.length; si++) {
		if (!sides[si] || sides[si].length === 0) continue;

		if (shouldReassess(si)) {
			const forceReplace = !!_planReassessNeeded[si];
			_planReassessNeeded[si] = false;
			const proposals = generateAllProposals(si);

			// Score each proposal
			for (const p of proposals) {
				p.priority = scoreProposal(p, si);
			}

			// Select and apply plans
			const selected = selectPlans(si, proposals);

			// Apply land plans to _warPlan slots
			// Only overwrite on forced reassessment; otherwise fill gaps
			if (selected.land1 && (!_warPlan[si] || forceReplace)) {
				_warPlan[si] = selected.land1;
			}
			if (selected.land2) {
				const lSlot2 = si + sides.length;
				if (!_warPlan[lSlot2] || forceReplace) {
					if (_warPlan.length <= lSlot2) {
						_warPlan[lSlot2] = selected.land2;
					} else {
						_warPlan[lSlot2] = selected.land2;
					}
				}
			}

			// Apply naval / supply plans
			if (selected.naval && (!_navalPlan[si] || forceReplace)) {
				_navalPlan[si] = selected.naval;
			}
			if (selected.supply && !_navalSupplyPlan[si]) {
				_navalSupplyPlan[si] = selected.supply;
			}

			// Apply coastal defense plans
			if (selected.coastal && selected.coastal.length > 0) {
				for (let ci = 0; ci < selected.coastal.length; ci++) {
					const slot = si * 10 + ci;
					_coastalDefensePlan[slot] = selected.coastal[ci];
				}
			}

			// Apply neutral garrison plans
			if (selected.garrisons && selected.garrisons.length > 0) {
				for (let gi = 0; gi < selected.garrisons.length; gi++) {
					const slot = si * 10 + gi;
					_neutralGarrisonPlan[slot] = selected.garrisons[gi];
				}
			}

			// If nothing was selected, flag for forced reassess next tick
			if (!_warPlan[si]) {
				_planReassessNeeded[si] = true;
			}

			_proposalReassessTick[si] = simFrameCount;
			_proposalsCache[si] = proposals;
		}
	}

	// Reset plan activeUnitCount every tick (cheap, no unit iteration)
	for (let _ri = 0; _ri < sides.length; _ri++) {
		if (!sides[_ri] || sides[_ri].length === 0) continue;
		if (_warPlan[_ri]) _warPlan[_ri].activeUnitCount = 0;
		const _l2 = _ri + sides.length;
		if (_warPlan[_l2]) _warPlan[_l2].activeUnitCount = 0;
		if (_navalPlan[_ri]) _navalPlan[_ri].activeUnitCount = 0;
		if (_navalSupplyPlan[_ri]) _navalSupplyPlan[_ri].activeUnitCount = 0;
		if (_defenderReactionPlan[_ri]) _defenderReactionPlan[_ri].activeUnitCount = 0;
		for (let _ci = 0; _ci < 10; _ci++) {
			const _cp = _coastalDefensePlan[_ri * 10 + _ci];
			if (_cp) _cp.activeUnitCount = 0;
			const _gp = _neutralGarrisonPlan[_ri * 10 + _ci];
			if (_gp) _gp.activeUnitCount = 0;
		}
	}

	if (simFrameCount % 5 === 0) {
	for (let si = 0; si < sides.length; si++) {
		if (!sides[si] || sides[si].length === 0) continue;
		const plan = _warPlan[si];
		if (!plan) {
			_planReassessNeeded[si] = true;
			continue;
		}

		// Reset per-tick unit count
		plan.activeUnitCount = 0;

		const ticksSinceStart = simFrameCount - (plan.startedTick || simFrameCount);
		const ticksSinceProgress =
			simFrameCount - (plan.lastProgressTick || simFrameCount);

		if (
			(plan.type === "CAPTURE_CITY" || plan.type === "ENCIRCLE") &&
			plan.target
		) {
			// Check if target area is now under friendly control
			const tIdx = getGridIndex(plan.target.lat, plan.target.lng);
			const captured = tIdx !== -1 && dominantSideMap[tIdx] === si;
			if (captured) {
				plan.phase = "CONSOLIDATION";
				plan.progress = 1.0;
				// After consolidation period, generate next plan
				if (ticksSinceProgress > 1800) {
					_planReassessNeeded[si] = true;
				}
				continue;
			}

			// PREPARATION → EXECUTION: advance when enough units rally at staging cells
			if (plan.phase === "PREPARATION" && plan.stagingCells?.length > 0) {
				let gathered = 0;
				for (const u of (_tickUnitsBySide[si] || [])) {
					if (u.deployTicks > 0) continue;
					const sc =
						plan.stagingCells[
							Math.floor(Math.abs(u.id * 1000000) % plan.stagingCells.length)
						];
					if (!sc) continue;
					const sdLat = sc.lat - u.lat;
					let sdLng = sc.lng - u.lng;
					if (sdLng > 180) sdLng -= 360;
					else if (sdLng < -180) sdLng += 360;
					if (sdLat * sdLat + sdLng * sdLng < 2.0) gathered++;
				}
				if (gathered >= Math.min(plan.maxAssignedUnits || 5, 5)) {
					plan.phase = "EXECUTION";
					plan.lastProgressTick = simFrameCount;
				}
			}

			// Check for stall
			if (ticksSinceProgress > 1800 && ticksSinceStart > 600) {
				_planReassessNeeded[si] = true; // Failed — reassess
				continue;
			}

			// Counter-offensive interrupt: if enemy pushes back significantly, abort
			const sideCountries = sides[si] || [];
			if (sideCountries.length > 0) {
				const firstCountry = sideCountries[0];
				const stats = latestCountryStats.get(firstCountry.id);
				if (stats && plan._territoryAtStart !== undefined) {
					const territoryLoss =
						plan._territoryAtStart - (stats.controlled || 0);
					if (territoryLoss > 50) {
						_planReassessNeeded[si] = true; // Enemy counter-offensive → reassess
						continue;
					}
				}
				// Track territory at plan start for interrupt detection
				if (stats && plan._territoryAtStart === undefined) {
					plan._territoryAtStart = stats.controlled || 0;
				}
			}
		}

		// Refresh plan progress tracking
		plan.lastProgressTick = simFrameCount;
	}

	// ── Land Plan Slot 2 Evaluation ──
	for (let si = 0; si < sides.length; si++) {
		if (!sides[si] || sides[si].length === 0) continue;
		const lSlot2 = si + sides.length;
		const plan2 = _warPlan[lSlot2];
		if (!plan2) continue;

		plan2.activeUnitCount = 0;

		const ticksSinceStart2 =
			simFrameCount - (plan2.startedTick || simFrameCount);
		const ticksSinceProgress2 =
			simFrameCount - (plan2.lastProgressTick || simFrameCount);

		if (
			(plan2.type === "CAPTURE_CITY" || plan2.type === "ENCIRCLE") &&
			plan2.target
		) {
			const tIdx2 = getGridIndex(plan2.target.lat, plan2.target.lng);
			const captured2 = tIdx2 !== -1 && dominantSideMap[tIdx2] === si;
			if (captured2) {
				plan2.phase = "CONSOLIDATION";
				plan2.progress = 1.0;
				if (ticksSinceProgress2 > 1800) {
					_planReassessNeeded[si] = true;
				}
				continue;
			}

			if (plan2.phase === "PREPARATION" && plan2.stagingCells?.length > 0) {
				let gathered2 = 0;
				for (const u of (_tickUnitsBySide[si] || [])) {
					if (u.deployTicks > 0) continue;
					const sc =
						plan2.stagingCells[
							Math.floor(Math.abs(u.id * 1000000) % plan2.stagingCells.length)
						];
					if (!sc) continue;
					const sdLat2 = sc.lat - u.lat;
					let sdLng2 = sc.lng - u.lng;
					if (sdLng2 > 180) sdLng2 -= 360;
					else if (sdLng2 < -180) sdLng2 += 360;
					if (sdLat2 * sdLat2 + sdLng2 * sdLng2 < 2.0) gathered2++;
				}
				if (gathered2 >= Math.min(plan2.maxAssignedUnits || 5, 5)) {
					plan2.phase = "EXECUTION";
					plan2.lastProgressTick = simFrameCount;
				}
			}

			if (ticksSinceProgress2 > 1800 && ticksSinceStart2 > 600) {
				_planReassessNeeded[si] = true;
				continue;
			}

			const sideCountries2 = sides[si] || [];
			if (sideCountries2.length > 0) {
				const firstCountry2 = sideCountries2[0];
				const stats2 = latestCountryStats.get(firstCountry2.id);
				if (stats2 && plan2._territoryAtStart !== undefined) {
					const territoryLoss2 =
						plan2._territoryAtStart - (stats2.controlled || 0);
					if (territoryLoss2 > 50) {
						_planReassessNeeded[si] = true;
						continue;
					}
				}
				if (stats2 && plan2._territoryAtStart === undefined) {
					plan2._territoryAtStart = stats2.controlled || 0;
				}
			}
		}

		plan2.lastProgressTick = simFrameCount;
	}

	// ── Naval Plan Evaluation ──
	for (let si = 0; si < sides.length; si++) {
		if (!sides[si] || sides[si].length === 0) continue;
		const np = _navalPlan[si];
		if (!np) {
			_planReassessNeeded[si] = true;
			continue;
		}

		// Reset per-tick counter
		np.activeUnitCount = 0;

		const ticksSinceStart = simFrameCount - (np.startedTick || simFrameCount);
		const ticksSinceProgress =
			simFrameCount - (np.lastProgressTick || simFrameCount);

		// Check if target is captured
		if (np.target) {
			const tIdx = getGridIndex(np.target.lat, np.target.lng);
			if (tIdx !== -1 && dominantSideMap[tIdx] === si) {
				// Target captured — clear naval plan
				_navalPlan[si] = null;
				continue;
			}
		}

		// Stall detection: if stalled for 30s, cancel naval plan
		if (ticksSinceProgress > 1800 && ticksSinceStart > 600) {
			// Release all assigned units
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (u.navalAssigned) {
					u.navalAssigned = false;
					u.isTransport = false;
				}
			}
			_navalPlan[si] = null;
			_planReassessNeeded[si] = true;
			continue;
		}

		// Phase transitions
		if (np.phase === "GATHERING") {
			// Count how many naval units are near staging point
			let gathered = 0;
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (!u.navalAssigned) continue;
				const sdLat = np.stagingPoint.lat - u.lat;
				let sdLng = np.stagingPoint.lng - u.lng;
				if (sdLng > 180) sdLng -= 360;
				else if (sdLng < -180) sdLng += 360;
				if (sdLat * sdLat + sdLng * sdLng < 0.5) gathered++;
			}
			if (gathered >= Math.min(np.maxAssignedUnits, 5)) {
				np.phase = "EMBARKATION";
				np.lastProgressTick = simFrameCount;
			}
		} else if (np.phase === "EMBARKATION") {
			// Check if most naval units are at sea
			let atSea = 0;
			let total = 0;
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (!u.navalAssigned) continue;
				total++;
				const gi = getGridIndex(u.lat, u.lng);
				if (gi === -1 || landMask[gi] === 0) atSea++;
			}
			if (total > 0 && atSea >= Math.ceil(total * 0.6)) {
				np.phase = "TRANSIT";
				np.lastProgressTick = simFrameCount;
			}
		} else if (np.phase === "TRANSIT") {
			// Check if naval units are reaching the target coast
			let landed = 0;
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (!u.navalAssigned) continue;
				const gi = getGridIndex(u.lat, u.lng);
				if (gi !== -1 && landMask[gi] > 0) {
					const tdLat = np.target.lat - u.lat;
					let tdLng = np.target.lng - u.lng;
					if (tdLng > 180) tdLng -= 360;
					else if (tdLng < -180) tdLng += 360;
					if (tdLat * tdLat + tdLng * tdLng < 2.0) landed++;
				}
			}
			if (landed >= 3) {
				np.phase = "LANDING";
				np.lastProgressTick = simFrameCount;
				// Immediately generate supply plan for the landing
				if (!_navalSupplyPlan[si]) _planReassessNeeded[si] = true;
			}
		} else if (np.phase === "LANDING") {
			// After enough time in landing, the plan completes
			if (ticksSinceProgress > 900) {
				// Count enemies within 5 degrees of the landing zone
				let _nearEnemies = 0;
				let _nearFriendlies = 0;
				for (const u of units) {
					if (u.deployTicks > 0) continue;
					const dLat = np.target.lat - u.lat;
					let dLng = np.target.lng - u.lng;
					if (dLng > 180) dLng -= 360;
					else if (dLng < -180) dLng += 360;
					const dSq = dLat * dLat + dLng * dLng;
					if (dSq < 25.0) {
						if (u.sideIndex === si) _nearFriendlies++;
						else _nearEnemies++;
					}
				}

				// Release naval-assigned units so they join the new land plan
				for (const u of (_tickUnitsBySide[si] || [])) {
					if (u.navalAssigned) {
						u.navalAssigned = false;
						u.isTransport = false;
					}
				}
				_navalPlan[si] = null;

				_planReassessNeeded[si] = true;
			}
		}
	}

	// ── Naval Supply Plan Evaluation ──
	for (let si = 0; si < sides.length; si++) {
		if (!sides[si] || sides[si].length === 0) continue;
		const sp = _navalSupplyPlan[si];

		if (!sp) {
			_planReassessNeeded[si] = true;
			continue;
		}

		sp.activeUnitCount = 0;

		// If the parent naval plan is gone, let supply finish independently

		const ticksSinceProgress =
			simFrameCount - (sp.lastProgressTick || simFrameCount);

		// Stall detection
		if (ticksSinceProgress > 1800) {
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (u.supplyAssigned) {
					u.supplyAssigned = false;
					u.isTransport = false;
				}
			}
			_navalSupplyPlan[si] = null;
			_planReassessNeeded[si] = true;
			continue;
		}

		// Phase transitions (mirrors naval invasion: GATHERING -> EMBARKATION -> TRANSIT -> DELIVERED)
		if (sp.phase === "GATHERING") {
			let gathered = 0;
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (!u.supplyAssigned) continue;
				const sdLat = sp.stagingPoint.lat - u.lat;
				let sdLng = sp.stagingPoint.lng - u.lng;
				if (sdLng > 180) sdLng -= 360;
				else if (sdLng < -180) sdLng += 360;
				if (sdLat * sdLat + sdLng * sdLng < 0.5) gathered++;
			}
			if (gathered >= Math.min(sp.maxAssignedUnits, 3)) {
				sp.phase = "EMBARKATION";
				sp.lastProgressTick = simFrameCount;
			}
		} else if (sp.phase === "EMBARKATION") {
			let atSea = 0;
			let total = 0;
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (!u.supplyAssigned) continue;
				total++;
				const gi = getGridIndex(u.lat, u.lng);
				if (gi === -1 || landMask[gi] === 0) atSea++;
			}
			if (total > 0 && atSea >= Math.ceil(total * 0.6)) {
				sp.phase = "TRANSIT";
				sp.lastProgressTick = simFrameCount;
			}
		} else if (sp.phase === "TRANSIT") {
			let landed = 0;
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (!u.supplyAssigned) continue;
				const gi = getGridIndex(u.lat, u.lng);
				if (gi !== -1 && landMask[gi] > 0) {
					const tdLat = sp.target.lat - u.lat;
					let tdLng = sp.target.lng - u.lng;
					if (tdLng > 180) tdLng -= 360;
					else if (tdLng < -180) tdLng += 360;
					if (tdLat * tdLat + tdLng * tdLng < 2.0) landed++;
				}
			}
			if (landed >= 2) {
				sp.phase = "DELIVERED";
				sp.lastProgressTick = simFrameCount;
			}
		} else if (sp.phase === "DELIVERED") {
			if (ticksSinceProgress > 600) {
				for (const u of (_tickUnitsBySide[si] || [])) {
					if (u.supplyAssigned) {
						u.supplyAssigned = false;
						u.isTransport = false;
					}
				}
				_navalSupplyPlan[si] = null;
			}
		}

		if (sp) sp.lastProgressTick = simFrameCount;
	}

	// ── Enemy Offensive Detection ──
	for (let si = 0; si < sides.length; si++) {
		if (!sides[si] || sides[si].length === 0) continue;
		for (let ei = 0; ei < sides.length; ei++) {
			if (ei === si) continue;
			if (!sides[ei] || sides[ei].length === 0) continue;
			for (const enemyPlan of [_warPlan[ei], _warPlan[ei + sides.length]]) {
				if (!enemyPlan?.target) continue;
				if (enemyPlan.type !== "CAPTURE_CITY" && enemyPlan.type !== "ENCIRCLE")
					continue;
				const tIdx = getGridIndex(enemyPlan.target.lat, enemyPlan.target.lng);
				if (tIdx !== -1 && dominantSideMap[tIdx] === si) {
					_planReassessNeeded[si] = true;
					break;
				}
			}
		}
	}

	// ── Coastal Defense Plan Evaluation ──
	for (let si = 0; si < sides.length; si++) {
		for (let ci = 0; ci < 10; ci++) {
			const slot = si * 10 + ci;
			const cp = _coastalDefensePlan[slot];
			if (!cp) continue;
			cp.activeUnitCount = 0;
			if (cp.target) {
				const tIdx = getGridIndex(cp.target.lat, cp.target.lng);
				if (tIdx !== -1 && dominantSideMap[tIdx] !== si) {
					for (const u of (_tickUnitsBySide[si] || [])) {
						if (u.coastalAssigned)
							u.coastalAssigned = false;
					}
					_coastalDefensePlan[slot] = null;
					continue;
				}
			}
			// Decay threat flags after 900 ticks (~15s)
			if (cp.threatenedTick && simFrameCount - cp.threatenedTick > 900) {
				cp.threatenedByTransit = false;
				cp.threatenedByGathering = false;
				delete cp.threatContact;
				delete cp.threatenedTick;
			}
		}
	}

	// ── Neutral Garrison Plan Evaluation ──
	for (let si = 0; si < sides.length; si++) {
		for (let gi = 0; gi < 10; gi++) {
			const slot = si * 10 + gi;
			const gp = _neutralGarrisonPlan[slot];
			if (!gp) continue;
			gp.activeUnitCount = 0;
			// Cancel if the neutral country has joined a side (became combatant)
			if (
				gp.neutralCountryId != null &&
				_tickCountryToSideMap.get(gp.neutralCountryId) !== undefined
			) {
				for (const u of (_tickUnitsBySide[si] || [])) {
					if (u.garrisonAssigned)
						u.garrisonAssigned = false;
				}
				_neutralGarrisonPlan[slot] = null;
			}
		}
	}

	// ── Proactive Detection: Enemy TRANSIT & GATHERING near our coast ──
	for (let si = 0; si < sides.length; si++) {
		if (!sides[si] || sides[si].length === 0) continue;
		for (let ei = 0; ei < sides.length; ei++) {
			if (ei === si) continue;
			if (!sides[ei] || sides[ei].length === 0) continue;
			const enemyNP = _navalPlan[ei];
			if (!enemyNP?.target) continue;

			if (enemyNP.phase === "TRANSIT") {
				for (const u of (_tickUnitsBySide[ei] || [])) {
					if (!u.navalAssigned) continue;
					for (let csi = si * 10; csi < si * 10 + 10; csi++) {
						const cp = _coastalDefensePlan[csi];
						if (!cp?.target) continue;
						const dLat = u.lat - cp.target.lat;
						let dLng = u.lng - cp.target.lng;
						if (dLng > 180) dLng -= 360;
						else if (dLng < -180) dLng += 360;
						if (dLat * dLat + dLng * dLng < 25.0) {
							cp.threatenedByTransit = true;
							cp.threatContact = {
								lat: u.lat,
								lng: u.lng,
							};
							cp.threatenedTick = simFrameCount;
						}
					}
				}
			} else if (enemyNP.phase === "GATHERING" && enemyNP.stagingPoint) {
				for (let csi = si * 10; csi < si * 10 + 10; csi++) {
					const cp = _coastalDefensePlan[csi];
					if (!cp?.target) continue;
					const dLat = enemyNP.stagingPoint.lat - cp.target.lat;
					let dLng = enemyNP.stagingPoint.lng - cp.target.lng;
					if (dLng > 180) dLng -= 360;
					else if (dLng < -180) dLng += 360;
					if (dLat * dLat + dLng * dLng < 100.0) {
						cp.threatenedByGathering = true;
						cp.threatContact = {
							lat: enemyNP.stagingPoint.lat,
							lng: enemyNP.stagingPoint.lng,
						};
						cp.threatenedTick = simFrameCount;
					}
				}
			}
		}
	}

	// ── Defender Reaction (Structured) ──
	for (let si = 0; si < sides.length; si++) {
		if (!sides[si] || sides[si].length === 0) continue;
		const rp = _defenderReactionPlan[si];

		// ---- Cancel stale / obsolete reaction plans ----
		if (rp) {
			const enemyNP =
				rp.enemySideIdx != null ? _navalPlan[rp.enemySideIdx] : null;
			const enemySideDead =
				rp.enemySideIdx != null &&
				(!sides[rp.enemySideIdx] || sides[rp.enemySideIdx].length === 0);

			let shouldCancel = false;
			if (enemySideDead || !enemyNP) {
				shouldCancel = true;
			} else if (rp._landingDefeatedTick) {
				if (simFrameCount - rp._landingDefeatedTick > 600) shouldCancel = true;
			}

			if (!shouldCancel && simFrameCount - rp.lastProgressTick > 1800) {
				shouldCancel = true;
			}

			if (shouldCancel) {
				for (const u of (_tickUnitsBySide[si] || [])) {
					u._defenderReactTarget = null;
				}
				_defenderReactionPlan[si] = null;
			}
		}

		// Track arrivals: units within 1° of target clear their flag
		if (_defenderReactionPlan[si]) {
			_defenderReactionPlan[si].activeUnitCount = 0;
			let anyArrived = false;
			for (const u of (_tickUnitsBySide[si] || [])) {
				if (!u._defenderReactTarget) continue;
				_defenderReactionPlan[si].activeUnitCount++;
				const rdLat = u._defenderReactTarget.lat - u.lat;
				let rdLng = u._defenderReactTarget.lng - u.lng;
				if (rdLng > 180) rdLng -= 360;
				else if (rdLng < -180) rdLng += 360;
				if (rdLat * rdLat + rdLng * rdLng < 1.0) {
					u._defenderReactTarget = null;
					anyArrived = true;
				}
			}
			if (anyArrived) {
				_defenderReactionPlan[si].lastProgressTick = simFrameCount;
			}
		}

		// ---- Detect threats & manage reaction plan ----
		for (let ei = 0; ei < sides.length; ei++) {
			if (ei === si) continue;
			if (!sides[ei] || sides[ei].length === 0) continue;
			const enemyNP = _navalPlan[ei];
			if (!enemyNP?.target) continue;

			const tIdx = getGridIndex(enemyNP.target.lat, enemyNP.target.lng);
			const onOurTerritory = tIdx !== -1 && dominantSideMap[tIdx] === si;

			const rpCur = _defenderReactionPlan[si];
			if (rpCur && rpCur.enemySideIdx !== ei) continue;

			// TRANSIT: pre-emptive reaction if heading to our territory
			if (enemyNP.phase === "TRANSIT" && onOurTerritory) {
				let rpCur2 = _defenderReactionPlan[si];
				if (!rpCur2) {
					const preActive = Math.min(
						10,
						Math.floor(_tickUnitsBySide[si] * 0.15),
					);
					if (preActive >= 3) {
						_defenderReactionPlan[si] = {
							type: "DEFEND",
							target: {
								lat: enemyNP.target.lat,
								lng: enemyNP.target.lng,
							},
							enemySideIdx: ei,
							phase: "EXECUTION",
							maxUnits: preActive,
							activeUnitCount: 0,
							startedTick: simFrameCount,
							lastProgressTick: simFrameCount,
						};
						rpCur2 = _defenderReactionPlan[si];
					}
				}
				if (!rpCur2 || rpCur2.activeUnitCount >= rpCur2.maxUnits) continue;

				const slotsOpen = rpCur2.maxUnits - rpCur2.activeUnitCount;
				let recruited = 0;
				for (const u of (_tickUnitsBySide[si] || [])) {
					// side-filtered via _tickUnitsBySide
					if (u.deployTicks > 0) continue;
					if (u.navalAssigned || u.supplyAssigned) continue;
					if (u.coastalAssigned || u.garrisonAssigned) continue;
					if (u._defenderReactTarget) continue;

					const dLat = rpCur2.target.lat - u.lat;
					let dLng = rpCur2.target.lng - u.lng;
					if (dLng > 180) dLng -= 360;
					else if (dLng < -180) dLng += 360;
					const dSq = dLat * dLat + dLng * dLng;

					if (dSq < 9.0 || dSq > 100.0) continue;

					u._defenderReactTarget = {
						lat: rpCur2.target.lat,
						lng: rpCur2.target.lng,
					};
					recruited++;
					if (recruited >= slotsOpen) break;
				}
				rpCur2.activeUnitCount += recruited;
			}

			// LANDING: full reactive response
			if (enemyNP.phase === "LANDING" && onOurTerritory) {
				let enemyLandingForce = 0;
				for (const u of (_tickUnitsBySide[ei] || [])) {
					// side-filtered via _tickUnitsBySide
					const dLat = enemyNP.target.lat - u.lat;
					let dLng = enemyNP.target.lng - u.lng;
					if (dLng > 180) dLng -= 360;
					else if (dLng < -180) dLng += 360;
					if (dLat * dLat + dLng * dLng < 4.0) enemyLandingForce++;
				}

				let rpCur2 = _defenderReactionPlan[si];
				if (!rpCur2 && enemyLandingForce >= 3) {
					_defenderReactionPlan[si] = {
						type: "DEFEND",
						target: {
							lat: enemyNP.target.lat,
							lng: enemyNP.target.lng,
						},
						enemySideIdx: ei,
						phase: "EXECUTION",
						maxUnits: 0,
						activeUnitCount: 0,
						startedTick: simFrameCount,
						lastProgressTick: simFrameCount,
					};
					rpCur2 = _defenderReactionPlan[si];
				}

				if (!rpCur2) continue;

				if (enemyLandingForce < 3) {
					if (!rpCur2._landingDefeatedTick)
						rpCur2._landingDefeatedTick = simFrameCount;
					continue;
				}
				rpCur2._landingDefeatedTick = 0;

				let localDefenders = 0;
				for (const u of (_tickUnitsBySide[si] || [])) {
					// side-filtered via _tickUnitsBySide
					if (u.deployTicks > 0) continue;
					const dLat = enemyNP.target.lat - u.lat;
					let dLng = enemyNP.target.lng - u.lng;
					if (dLng > 180) dLng -= 360;
					else if (dLng < -180) dLng += 360;
					if (dLat * dLat + dLng * dLng < 9.0) localDefenders++;
				}

				const ratio = localDefenders / Math.max(1, enemyLandingForce);
				if (ratio < 1.5) {
					const needed = Math.ceil(enemyLandingForce * 1.5 - localDefenders);
					rpCur2.maxUnits = Math.max(rpCur2.maxUnits, needed);
				}

				if (rpCur2.activeUnitCount >= rpCur2.maxUnits) continue;

				const slotsOpen = rpCur2.maxUnits - rpCur2.activeUnitCount;
				let recruited = 0;
				for (const u of (_tickUnitsBySide[si] || [])) {
					// side-filtered via _tickUnitsBySide
					if (u.deployTicks > 0) continue;
					if (u.navalAssigned || u.supplyAssigned) continue;
					if (u.coastalAssigned || u.garrisonAssigned) continue;
					if (u._defenderReactTarget) continue;

					const dLat = rpCur2.target.lat - u.lat;
					let dLng = rpCur2.target.lng - u.lng;
					if (dLng > 180) dLng -= 360;
					else if (dLng < -180) dLng += 360;
					const dSq = dLat * dLat + dLng * dLng;

					if (dSq < 9.0 || dSq > 100.0) continue;

					u._defenderReactTarget = {
						lat: rpCur2.target.lat,
						lng: rpCur2.target.lng,
					};
					recruited++;
					if (recruited >= slotsOpen) break;
				}
				rpCur2.activeUnitCount += recruited;
			}
		}
	}

	// ── Orphan _defenderReactTarget Cleanup ──
	for (const u of units) {
		if (u._defenderReactTarget && !_defenderReactionPlan[u.sideIndex]) {
			u._defenderReactTarget = null;
		}
	}

	// Clean up plans for inactive sides
	// Land plans use indices 0..sides.length-1 (slot 1) and
	// sides.length..sides.length*2-1 (slot 2). Only null beyond slot 2.
	for (let si = sides.length * 2; si < _warPlan.length; si++) {
		_warPlan[si] = null;
	}
	for (let si = sides.length; si < _navalPlan.length; si++) {
		// Release any assigned units
		for (const u of units) {
			if (u.navalAssigned) {
				u.navalAssigned = false;
				u.isTransport = false;
			}
		}
		_navalPlan[si] = null;
	}
	for (let si = sides.length; si < _navalSupplyPlan.length; si++) {
		for (const u of units) {
			if (u.supplyAssigned) {
				u.supplyAssigned = false;
				u.isTransport = false;
			}
		}
		_navalSupplyPlan[si] = null;
	}
	for (let si = sides.length * 10; si < _coastalDefensePlan.length; si++) {
		for (const u of units) {
			if (u.coastalAssigned) u.coastalAssigned = false;
		}
		_coastalDefensePlan[si] = null;
	}
	for (let si = sides.length * 10; si < _neutralGarrisonPlan.length; si++) {
		for (const u of (_tickUnitsBySide[si] || [])) {
			if (u.garrisonAssigned) u.garrisonAssigned = false;
		}
		_neutralGarrisonPlan[si] = null;
	}
	for (let si = sides.length; si < _defenderReactionPlan.length; si++) {
		for (const u of (_tickUnitsBySide[si] || [])) {
			u._defenderReactTarget = null;
		}
		_defenderReactionPlan[si] = null;
	}
	}
}

export function performSimulationTick() {
	// PERF PROFILER - check window.__perf in console
	if (!window.__perf) window.__perf = { plans: 0, recruit: 0, unitLoop: 0, post: 0, ticks: 0 };
	window.__perf.ticks++;
	const _t0 = performance.now();
	// TODO: Remove per-unit level thinking. Only army groups and war plans should
	// move units — no per-unit level movement and decision making. War plans are the
	// bread and butter of AI movement. Individual unit targeting, mop-up search,
	// independent pathfinding, and proximity combat decisions should all be replaced
	// by plan-driven directives.

	// If war is over, stop simulation mechanics (but update loop may continue for aftermath recording)
	if (gameState === "WAR_OVER") return false;
	// If in God Mode but the war hasn't started yet, don't tick simulation mechanics
	if (godModeActive && preGodModeState !== "SIMULATING") return false;

	// 0. Initial Utility Helpers
	const recordDamage = (targetUnit, dmg, attackerUnit) => {
		if (
			Number.isNaN(dmg) ||
			dmg <= 0 ||
			Number.isNaN(targetUnit.health) ||
			targetUnit.health <= 0
		)
			return;

		const effectiveDmg = Math.min(targetUnit.health, dmg);
		const sIdx = targetUnit.sideIndex;
		const ratio =
			sIdx >= 0 && sIdx < MAX_SIDES
				? soldiersPerUnit[sIdx] || CONFIG.UNIT_TO_SOLDIER_RATIO
				: CONFIG.UNIT_TO_SOLDIER_RATIO;
		const loss = (effectiveDmg / CONFIG.UNIT_HEALTH) * ratio;

		if (sIdx >= 0 && sIdx < MAX_SIDES) {
			sideSoldiers[sIdx] = Math.max(0, sideSoldiers[sIdx] - loss);
		}

		const currentTotal = countryCasualties.get(targetUnit.sovereignId) || 0;
		countryCasualties.set(targetUnit.sovereignId, currentTotal + loss);

		if (attackerUnit && attackerUnit.sovereignId !== targetUnit.sovereignId) {
			const victimMap = casualtyByAttacker.get(targetUnit.sovereignId);
			if (victimMap) {
				const prev = victimMap.get(attackerUnit.sovereignId) || 0;
				victimMap.set(attackerUnit.sovereignId, prev + loss);
			}
		}

		targetUnit.health -= dmg;
	};

	// Random War Mode mid‑simulation has been disabled to avoid corrupting existing wars.
	// Random wars can still be started manually from the setup screen via the Random War button.

	// 0. Initialize Tick Caches early to avoid access-before-initialization errors
	activeBattles = []; _battleHash.clear();
	latestCountryStats.clear();
	const countryStats = latestCountryStats;
	_tickCombatantIds.clear();
	const combatantIds = _tickCombatantIds;
	_tickCountryToSideMap.clear();
	const countryToSideMap = _tickCountryToSideMap;

	sides.forEach((side, idx) => {
		side.forEach((c) => {
			combatantIds.add(c.id);
			countryToSideMap.set(c.id, idx);
			countryStats.set(c.id, { units: 0, controlled: 0, owned: 0 });
		});
	});

	const isNeutral = (idx) =>
		idx !== -1 && landMask[idx] > 0 && !combatantIds.has(worldControlMap[idx]);
	const isNeutralCountry = (idx) => isNeutral(idx) && worldControlMap[idx] > 0;

	// Determine unit counts once
	let p1UnitsCount = 0;
	let p2UnitsCount = 0;
	for (let i = 0; i < units.length; i++) {
		const u = units[i];
		if (u.sideIndex === 0) p1UnitsCount++;
		else if (u.sideIndex === 1) p2UnitsCount++;
		const s = countryStats.get(u.sovereignId);
		if (s) s.units++;
	}

	// 1. Update territory
	updatePersistentInfluence(p1UnitsCount, p2UnitsCount, countryToSideMap);

	// 1a. Occupancy Smoothing: Occasionally clean up primaryOccupierMap during war to prevent speckling
	if (simFrameCount % 120 === 0) {
		const sampleCount = 5000;
		const modified = [];
		for (let s = 0; s < sampleCount; s++) {
			const idx = Math.floor(Math.random() * primaryOccupierMap.length);
			if (landMask[idx] !== 2 || primaryOccupierMap[idx] === 0) continue;

			const myId = primaryOccupierMap[idx];
			const mySide = countryToSideMap.get(myId);

			// Sample 3x3 neighborhood
			const y = Math.floor(idx / gridWidth);
			const x = idx % gridWidth;
			const counts = Object.create(null);
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
						const nId = primaryOccupierMap[ny * gridWidth + nx];
						const nSide = countryToSideMap.get(nId);
						// Only count allies
						if (nId > 0 && nSide !== undefined && nSide === mySide) {
							counts[nId] = (counts[nId] || 0) + 1;
						}
					}
				}
			}

			let dominantAlly = myId;
			let maxC = 0;
			for (const id of Object.keys(counts)) {
				const c = counts[id];
				if (c > maxC) {
					maxC = c;
					dominantAlly = Number(id);
				}
			}

			// If the occupier is a tiny island in an allied sea (majority neighbors are a single ally), flip to them.
			if (maxC >= 5 && dominantAlly !== myId) {
				modified.push({ idx, dominantAlly });
			}
		}
		// Apply modifications without a massive 24MB array GC copy
		for (let i = 0; i < modified.length; i++) {
			primaryOccupierMap[modified[i].idx] = modified[i].dominantAlly;
		}
	}

	// 1b. Territorial Integrity: Collapse deep pockets and isolated protrusions (Enclaves/Exclaves)
	// We sample the grid to find territory that is surrounded by the enemy.
	// This aggressively decays "border gore" and isolated bubbles.
	// PERF: Throttled — only runs on "counting" frames (same cadence as shouldCountLand)
	//       to avoid 5000-sample random scans on every single tick (was 13% self-time).
	const optimizationFactor = getOptimizationFactor();
	const countInterval = Math.max(15, Math.floor(15 * simSpeed));
	const shouldCountLand = simFrameCount % countInterval === 0;
	if (shouldCountLand) {
		const integBase = 5000;
		const integSamples = Math.max(
			1000,
			Math.floor(integBase / optimizationFactor),
		);
		for (let s = 0; s < integSamples; s++) {
			const idx = Math.floor(Math.random() * landMask.length);
			if (landMask[idx] !== 2) continue;
			const dsIdx = dominantSideMap[idx];
			if (dsIdx < 0) continue;

			const ownerId = worldControlMap[idx];
			const sideIdx = countryToSideMap.get(ownerId);
			if (sideIdx === undefined) continue;

			const isEnemyOccupation = dsIdx !== sideIdx;
			const isSelfOccupation = dsIdx === sideIdx;

			const y = Math.floor(idx / gridWidth);
			const x = idx % gridWidth;
			let sovereignNeighbors = 0;
			let enemyOccupiedNeighbors = 0;

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dy === 0 && dx === 0) continue;
					const ny = y + dy;
					const nx = x + dx;
					if (ny < 0 || ny >= gridHeight || nx < 0 || nx >= gridWidth) continue;
					const nIdx = ny * gridWidth + nx;
					if (worldControlMap[nIdx] === ownerId) sovereignNeighbors++;
					const nDsIdx = dominantSideMap[nIdx];
					if (nDsIdx >= 0 && nDsIdx !== sideIdx) enemyOccupiedNeighbors++;
				}
			}

			if (isEnemyOccupation && sovereignNeighbors >= 6) {
				for (let si = 0; si < sideInfluenceMaps.length; si++)
					sideInfluenceMaps[si][idx] *= 0.8;
				syncOccupationFromSideInfluence(idx);
			}

			if (isSelfOccupation && enemyOccupiedNeighbors >= 7) {
				sideInfluenceMaps[dsIdx][idx] *= 0.75;
				syncOccupationFromSideInfluence(idx);
			}
		}
	} // end shouldCountLand guard for territorial integrity

	// 2. Statistics & Soldiers (Dynamic based on units)
	// PERF: Full 2.88M-cell occupationMap scan throttled to shouldCountLand frames only.
	//       Was 29% total time — now runs every 15+ frames and caches the result.
	if (shouldCountLand) {
		let p1Tmp = 0,
			p2Tmp = 0;
		for (let i = 0; i < occupationMap.length; i++) {
			if (landMask[i] === 2) {
				// Match visual frontline threshold (0)
				if (occupationMap[i] > 0) p1Tmp++;
				else if (occupationMap[i] < 0) p2Tmp++;
			}
		}
		_cachedP1T = p1Tmp;
		_cachedP2T = p2Tmp;
	}
	const p1T = _cachedP1T,
		p2T = _cachedP2T;
	const _p1LandScore = p1T + p2T > 0 ? (p1T / (p1T + p2T)) * 100 : 50;

	// Manpower is a fixed pool initialized at war start and reduced by casualties;
	// do not recompute it from current unit counts here.
	// We only ensure it never goes negative and keep casualties in sync with it below.
	for (let sIdx = 0; sIdx < MAX_SIDES; sIdx++) {
		sideSoldiers[sIdx] = Math.max(0, sideSoldiers[sIdx]);
	}

	// 3. AI & Combat (Including Mid-War Recruitment)
	// NOTE: shouldCountLand and countInterval are now computed earlier (before territorial integrity)
	//       to share the same throttle cadence across all heavy grid scans.

	// Build Spatial Hash for ultra-fast O(1) local combat & target lookup
	// Shared with renderer to allow high-performance unit culling
	unitSpatialHash.clear();
	const unitHash = unitSpatialHash;
	const HASH_SIZE = UNIT_HASH_CELL_SIZE;
	for (let i = 0; i < units.length; i++) {
		const u = units[i];
		if (Number.isNaN(u.lat) || Number.isNaN(u.lng)) continue;
		const kx = Math.floor((u.lng + 180) / HASH_SIZE);
		const ky = Math.floor((u.lat + 90) / HASH_SIZE);
		const k = `${kx}_${ky}`;
		let arr = unitHash.get(k);
		if (!arr) {
			arr = [];
			unitHash.set(k, arr);
		}
		arr.push(u);
	}

	// OPT-1: Rebuild frontline direction field every N ticks via Web Worker.
	// getBorderDirection() now does an O(1) array lookup instead of a 12-radius grid scan.
	if (simFrameCount - frontlineFieldTick >= FRONTLINE_FIELD_UPDATE_INTERVAL) {
		frontlineFieldTick = simFrameCount;
		if (_simWorker && !_workerBusy) {
			_workerBusy = true;
			const lmCopy = new Uint8Array(landMask);
			const dsCopy = new Int8Array(dominantSideMap);
			_simWorker.postMessage(
				{
					landMask: lmCopy.buffer,
					dominantSideMap: dsCopy.buffer,
					gridWidth,
					gridHeight,
					gridRes: CONFIG.GRID_RES,
				},
				[lmCopy.buffer, dsCopy.buffer],
			);
		} else {
			rebuildFrontlineField();
		}
	}

	// Compute frontline polylines between warring sides (throttled)
	if (simFrameCount - _frontlinePolyTick >= FRONTLINE_POLY_UPDATE_INTERVAL) {
		computeFrontlinePolys();
		_frontlinePolyTick = simFrameCount;
	}
	assignFrontlineSlots();

	// --- UNIT CONSOLIDATION (Merge Stacks) ---
	// Periodically merge units of the same team that are virtually overlapping.
	// This fulfills the "no stacks" optimization and boosts performance in massive wars.
	if (simFrameCount % 30 === 0 && units.length > 40) {
		const mergeDistSq = 0.14 * 0.14; // ~15km radius for merging
		const maxMergedHealth = CONFIG.UNIT_HEALTH * 5; // Cap to prevent invincible "super-units"
		const unitsToRemove = new Set();

		for (let i = 0; i < units.length; i++) {
			const u = units[i];
			// Skip if already marked for removal or already at max merged strength
			if (
				unitsToRemove.has(u) ||
				u.health >= maxMergedHealth ||
				u.deployTicks > 0
			)
				continue;

			const kx = Math.floor((u.lng + 180) / HASH_SIZE);
			const ky = Math.floor((u.lat + 90) / HASH_SIZE);
			const k = `${kx}_${ky}`;
			const cellUnits = unitHash.get(k);
			if (!cellUnits) continue;

			for (let j = 0; j < cellUnits.length; j++) {
				const other = cellUnits[j];
				// Must be a different unit, same team, same sovereign, and not already being removed
				if (
					other === u ||
					unitsToRemove.has(other) ||
					other.sideIndex === u.sideIndex ||
					other.sovereignId !== u.sovereignId ||
					other.deployTicks > 0
				)
					continue;

				// Simple squared distance check
				let dlng = other.lng - u.lng;
				if (dlng > 180) dlng -= 360;
				else if (dlng < -180) dlng += 360;
				const dSq = (u.lat - other.lat) ** 2 + dlng ** 2;

				if (dSq < mergeDistSq) {
					const capacity = maxMergedHealth - u.health;
					const transfer = Math.min(capacity, other.health);

					u.health += transfer;
					other.health -= transfer;

					// If the other unit is depleted, mark for removal
					if (other.health <= 0) {
						unitsToRemove.add(other);
					}

					// If the primary unit is full, stop looking for more neighbors to merge
					if (u.health >= maxMergedHealth) break;
				}
			}
		}

		if (unitsToRemove.size > 0) {
			units = units.filter((u) => !unitsToRemove.has(u));
			// Re-sync casualty counts: these units weren't destroyed by enemies, just consolidated.
			// No action needed here as personnel display derives from live unit health.
		}
	}
	if (shouldCountLand) {
		recalculateAllBounds();
		const countryFrontlines = new Map();
		sides.flat().forEach((c) => {
			countryFrontlines.set(c.id, 0);
		});
		let _warCells = 0;
		let _orphanWarCells = 0;
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;

		for (let i = 0; i < worldControlMap.length; i++) {
			if (landMask[i] === 2) {
				_warCells++;
				const y = Math.floor(i / gridWidth);
				const x = i % gridWidth;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;

				const sid = worldControlMap[i];
				const stats = countryStats.get(sid);
				if (!combatantIds.has(sid)) _orphanWarCells++;
				if (stats) {
					// Raw ownership in the active warzone, independent of occupation polarity.
					// This is used by capitulation fail-safes for edge cases (exiled/naval remnants).
					stats.owned++;
					const sIdx = countryToSideMap.get(sid);
					if (dominantSideMap[i] === sIdx) {
						stats.controlled++;
					}

					// Count frontline cells for saturation check
					const neighbors = [i + 1, i - 1, i + gridWidth, i - gridWidth];
					let isFront = false;
					for (const n of neighbors) {
						if (n >= 0 && n < worldControlMap.length) {
							const nid = worldControlMap[n];
							const nsid = countryToSideMap.get(nid);
							if (nid > 0 && nsid !== undefined && nsid !== sIdx) {
								isFront = true;
								break;
							}
						}
					}
					if (isFront) {
						countryFrontlines.set(sid, countryFrontlines.get(sid) + 1);
					}
				}
			}
		}

		// Determine saturation for each country
		sides.flat().forEach((c) => {
			const stats = countryStats.get(c.id);
			const frontCount = countryFrontlines.get(c.id) || 0;
			// Strict Saturation Requirement: Nations must man 100% of their identified frontline before pushing.
			const saturationThreshold = 1.0;
			if (stats) {
				if (stats.units >= frontCount * saturationThreshold) {
					c.isSaturated = true;
				} else if (stats.units < frontCount * 0.6) {
					// Drop saturation if decimated below 60% coverage to force regrouping
					c.isSaturated = false;
				}
			}
		});
	} else {
		// Carry over stats from the last "counting" frame.
		// For unitless countries, never inflate controlled/owned to initialCells —
		// a country with no army can't be controlling territory it hasn't
		// been counted for. Default to 0 so capitulation can fire promptly.
		sides.flat().forEach((c) => {
			const stats = countryStats.get(c.id);
			if (stats) {
				const fallback = stats.units === 0 ? 0 : c.initialCells || 0;
				stats.controlled =
					c.lastControlledCount !== undefined
						? c.lastControlledCount
						: fallback;
				stats.owned =
					c.lastOwnedCount !== undefined ? c.lastOwnedCount : fallback;
			}
		});
	}

	// Persist stats for next frame's "non-counting" logic
	sides.flat().forEach((c) => {
		const stats = countryStats.get(c.id);
		if (stats && shouldCountLand) {
			c.lastControlledCount = stats.controlled;
			c.lastOwnedCount = stats.owned;
		}
	});

	while (_tickUnitsBySide.length < sides.length) _tickUnitsBySide.push([]);
	for (let si = 0; si < sides.length; si++) _tickUnitsBySide[si].length = 0;
	for (let ui = 0; ui < units.length; ui++) {
		const sIdx = units[ui].sideIndex;
		if (sIdx >= 0 && sIdx < sides.length)
			_tickUnitsBySide[sIdx].push(units[ui]);
	}
	const unitsBySide = _tickUnitsBySide;

	// Pre-compute grid index for every unit (O(n) once, avoids O(n) getGridIndex per enemy)
	const _unitGridIdx = new Map();
	for (let _ugi = 0; _ugi < units.length; _ugi++) {
		const _ug = units[_ugi];
		_unitGridIdx.set(_ug, getGridIndex(_ug.lat, _ug.lng));
	}

	// Pre-build country lookup Map (avoids .find() per enemy per unit)
	const _countryById = new Map();
	for (let _csi = 0; _csi < sides.length; _csi++) {
		for (let _cc = 0; _cc < sides[_csi].length; _cc++) {
			_countryById.set(sides[_csi][_cc].id, sides[_csi][_cc]);
		}
	}
	// City target list used for CITY FOCUS and URBAN strategies; prefer the active theater,
	// and fall back to all known cities if no theater is defined.
	const cityTargets = activeTheaterCities?.length
		? activeTheaterCities
		: cities || [];

	// Calculate Victory Ratios for each side to coordinate surges
	const sideVictoryRatios = unitsBySide.map((sideUnits, sIdx) => {
		if (sideUnits.length === 0) return 0;
		const winners = sideUnits.filter((u) => u.victoryBoostTicks > 0).length;
		const ratio = winners / sideUnits.length;

		// Global Surge State: Update coordinated push status for each side
		const sideCountries = sides[sIdx];
		if (sideCountries) {
			sideCountries.forEach((c) => {
				// Lowered surge threshold to 60% momentum for more consistent offensive action.
				// A side starts a coordinated surge when victory momentum is good (>60%)
				// and frontline saturation is achieved.
				if (!c.isSurging && ratio > 0.6 && c.isSaturated) {
					c.isSurging = true;
				}
				// The surge breaks and units hold once momentum falls below 35%.
				else if (c.isSurging && ratio < 0.35) {
					c.isSurging = false;
				}

				// If not saturated, immediately kill any active surge to force line-filling.
				if (!c.isSaturated) c.isSurging = false;
			});
		}

		return ratio;
	});

	// Calculate centroids for each side to help with strategic "fanning out"
	// Group-Based Hive Intelligence: Partition each side into 4 tactical battle groups
	const numGroups = 4;
	const sideCentroids = sides.map((_, idx) => {
		const sideUnits = unitsBySide[idx];
		if (sideUnits.length === 0) return null;

		const groups = Array.from({ length: numGroups }, () => ({
			latSum: 0,
			lngSum: 0,
			count: 0,
			vLat: 0,
			vLng: 0,
		}));
		sideUnits.forEach((u) => {
			const gIdx = Math.floor(u.id * 1000) % numGroups;
			groups[gIdx].latSum += u.lat;
			groups[gIdx].lngSum += u.lng;
			groups[gIdx].vLat += u.dirLat || 0;
			groups[gIdx].vLng += u.dirLng || 0;
			groups[gIdx].count++;
		});

		return groups.map((g) =>
			g.count > 0
				? {
						lat: g.latSum / g.count,
						lng: g.lngSum / g.count,
						vLat: g.vLat / g.count,
						vLng: g.vLng / g.count,
						count: g.count,
					}
				: null,
		);
	});

	// Pre-calculate collapsed nations for each side to avoid O(N^2) complexity inside the unit loop
	const sideToCollapsedNations = sides.map((_side, idx) => {
		const enemies = [];
		sides.forEach((s, sIdx) => {
			const isEnemy = sIdx !== idx;
			if (isEnemy && s.length > 0) {
				s.forEach((c) => {
					const stats = countryStats.get(c.id);
					if (stats && stats.units === 0 && stats.controlled > 0) {
						// Support nations are only valid targets for mop-up if they've already been "activated"
						// (meaning someone has managed to breach their border already).
						if (c.role === "SUPPORT") {
							const initial = c.initialCells || 1;
							if (stats.controlled >= initial * 0.99) {
								// Virtually untouched support nation, ignore for now
								return;
							}
						}
						enemies.push(c);
					}
				});
			}
		});
		// Prioritize OFFENSE nations in the mop-up list to ensure core enemies are finished first
		enemies.sort((a, b) => {
			const aOffense = a.role === "OFFENSE" ? 1 : 0;
			const bOffense = b.role === "OFFENSE" ? 1 : 0;
			return bOffense - aOffense;
		});
		return enemies;
	});

	_tickCountryToCityCount.clear();
	const countryToCityCount = _tickCountryToCityCount;
	_tickCountryCapitalLost.clear();
	const countryCapitalLost = _tickCountryCapitalLost;

	activeTheaterCities.forEach((city) => {
		const idx = getGridIndex(city.lat, city.lng);
		const ownerId = primaryOccupierMap[idx];
		const originalSovereignId = city.sovereignId;

		if (ownerId > 0) {
			countryToCityCount.set(
				ownerId,
				(countryToCityCount.get(ownerId) || 0) + 1,
			);
		}

		if (city.isCapital && originalSovereignId > 0) {
			const originalSide = countryToSideMap.get(originalSovereignId);
			const ds = dominantSideMap[idx];
			const isOccupiedByEnemy = ds !== -1 && ds !== originalSide;
			if (isOccupiedByEnemy) {
				countryCapitalLost.set(originalSovereignId, true);
			}
		}
	});
	// Expose capital-loss state globally so recruitment/spawn logic can react to supply failure
	capitalLostCountries = new Set(countryCapitalLost.keys());

	// --- COUNTRY AI POSTURE (Desperation + realism tuning) ---
	// Recomputed on counting frames and reused between them.
	if (shouldCountLand) {
		sides.flat().forEach((country) => {
			if (!country) return;
			const stats = countryStats.get(country.id);
			if (!stats) return;

			const initialLand = Math.max(1, country.initialCells || 1);
			const controlRatio = stats.controlled / initialLand;
			const cityCount = countryToCityCount.get(country.id) || 0;
			if (country._aiInitialCities === undefined)
				country._aiInitialCities = cityCount;
			const initCities = Math.max(1, country._aiInitialCities || 1);
			const cityRatio = cityCount / initCities;

			const prevControlled =
				country._aiPrevControlled !== undefined
					? country._aiPrevControlled
					: stats.controlled;
			const deltaControlled = stats.controlled - prevControlled;
			country._aiPrevControlled = stats.controlled;

			const stallDeltaThreshold = Math.max(
				1,
				Math.floor(initialLand * AI_DESPERATION.OFFENSE_STALL_DELTA_FRAC),
			);
			const isStalled = Math.abs(deltaControlled) <= stallDeltaThreshold;
			if (isStalled) {
				country._aiStallTicks = (country._aiStallTicks || 0) + countInterval;
			} else {
				country._aiStallTicks = Math.max(
					0,
					(country._aiStallTicks || 0) - countInterval * 2,
				);
			}

			const role = country.role || "OFFENSE";
			const canUseOffensiveDesperation =
				role === "OFFENSE" &&
				simFrameCount >= AI_DESPERATION.OFFENSE_MIN_WAR_TICKS &&
				(country._aiStallTicks || 0) >= AI_DESPERATION.OFFENSE_STALL_TICKS &&
				controlRatio > 0.45;

			const lastStand =
				controlRatio <= AI_DESPERATION.LAST_STAND_TRIGGER_RATIO ||
				cityRatio <= AI_DESPERATION.CITY_RATIO_LAST_STAND_TRIGGER;
			const defensiveDesperation =
				!lastStand &&
				(controlRatio <= AI_DESPERATION.DEFENSE_TRIGGER_RATIO ||
					cityRatio <= AI_DESPERATION.CITY_RATIO_DEFENSE_TRIGGER);

			let mode = "NORMAL";
			if (lastStand) mode = "LAST_STAND";
			else if (defensiveDesperation) mode = "DEFENSIVE_DESPERATION";
			else if (canUseOffensiveDesperation) mode = "OFFENSIVE_DESPERATION";

			let profile = {
				mode,
				recruitCapMult: 1.0,
				recruitChanceMult: 1.0,
				retreatTriggerMultiple: 8.0,
				frontlineBlend: 0.35,
				speedMult: 1.0,
				targetCityWeight: 0.0,
				forceDefensive: false,
				reserveShare: 0.02,
				peacePressure: 0.0,
			};
			if (mode === "OFFENSIVE_DESPERATION") {
				profile = {
					mode,
					recruitCapMult: 1.2,
					recruitChanceMult: 1.45,
					retreatTriggerMultiple: 10.0,
					frontlineBlend: 0.45,
					speedMult: 1.08,
					targetCityWeight: 0.45,
					forceDefensive: false,
					reserveShare: 0.01,
					peacePressure: 0.02,
				};
			} else if (mode === "DEFENSIVE_DESPERATION") {
				profile = {
					mode,
					recruitCapMult: 1.45,
					recruitChanceMult: 1.8,
					retreatTriggerMultiple: 5.8,
					frontlineBlend: 0.4,
					speedMult: 0.96,
					targetCityWeight: 0.18,
					forceDefensive: true,
					reserveShare: 0.06,
					peacePressure: 0.36,
				};
			} else if (mode === "LAST_STAND") {
				profile = {
					mode,
					recruitCapMult: 1.85,
					recruitChanceMult: 2.5,
					retreatTriggerMultiple: 4.8,
					frontlineBlend: 0.3,
					speedMult: 0.92,
					targetCityWeight: 0.05,
					forceDefensive: true,
					reserveShare: 0.1,
					peacePressure: 0.7,
				};
			}

			aiCountryState.set(country.id, profile);
		});
	}

	// ── Auto Posture: per-side strength ratio → OFFENSIVE/BALANCED/DEFENSIVE ──
	const sideStrength = new Array(sides.length).fill(0);
	const sideUnitCounts = new Array(sides.length).fill(0);
	for (let i = 0; i < units.length; i++) {
		const u = units[i];
		if (u.deployTicks > 0) continue;
		const si = u.sideIndex;
		if (si < 0 || si >= sides.length) continue;
		sideUnitCounts[si]++;
		const meta = countryMetadata[u.sovereignId - 1];
		const buff = getEffectiveBuffState(
			sides[si]?.find((c) => c.id === u.sovereignId),
			meta || null,
		);
		const buffMult =
			{
				buff: 2.5,
				super: 10,
				godly: 40,
				weakened: 0.7,
				crippled: 0.4,
			}[buff] || 1.0;
		sideStrength[si] += buffMult * (u.health / CONFIG.UNIT_HEALTH);
	}

	_sidePosture = new Array(sides.length).fill("BALANCED");
	for (let si = 0; si < sides.length; si++) {
		if (sideUnitCounts[si] === 0) continue;
		let totalEnemyStrength = 0;
		let totalEnemyUnits = 0;
		for (let ej = 0; ej < sides.length; ej++) {
			if (ej === si) continue;
			totalEnemyStrength += sideStrength[ej];
			totalEnemyUnits += sideUnitCounts[ej];
		}
		// Check if this side has LAST_STAND or OFFENSIVE_DESPERATION countries
		let hasLastStand = false;
		let hasOffDesp = false;
		sides[si].forEach((c) => {
			const prof = aiCountryState.get(c.id);
			if (prof?.mode === "LAST_STAND") hasLastStand = true;
			if (prof?.mode === "OFFENSIVE_DESPERATION") hasOffDesp = true;
		});

		if (hasLastStand) {
			_sidePosture[si] = "DEFENSIVE";
		} else if (hasOffDesp) {
			_sidePosture[si] = "OFFENSIVE";
		} else if (totalEnemyUnits > 0) {
			const ratio = sideStrength[si] / Math.max(1, totalEnemyStrength);
			if (ratio > 1.5) _sidePosture[si] = "OFFENSIVE";
			else if (ratio < 0.7) _sidePosture[si] = "DEFENSIVE";
		}

		// Apply posture to country profiles
		if (_sidePosture[si] === "DEFENSIVE") {
			sides[si].forEach((c) => {
				const prof = aiCountryState.get(c.id);
				if (prof) {
					prof.forceDefensive = true;
					prof.frontlineBlend = Math.min(prof.frontlineBlend, 0.3);
					prof.speedMult = Math.min(prof.speedMult, 0.96);
				}
			});
		} else if (_sidePosture[si] === "OFFENSIVE") {
			sides[si].forEach((c) => {
				const prof = aiCountryState.get(c.id);
				if (prof) {
					prof.forceDefensive = false;
					prof.frontlineBlend = Math.max(prof.frontlineBlend, 0.4);
				}
			});
		}
	}

	// Evaluate war plans — check completion/failure, regenerate if needed
	const _t1 = performance.now();
	evaluateAllPlans();
	window.__perf.plans += performance.now() - _t1;

	// ── Compute neutral border polylines (throttled to every 60 ticks) ──
	const NEUTRAL_BORDER_INTERVAL = 60;
	if (adjacencyCache && (simFrameCount % NEUTRAL_BORDER_INTERVAL === 0 || Object.keys(_neutralBorderPolys).length === 0)) {
		_neutralBorderPolys = {};

		// Identify combatant countries with neutral neighbors
		const combatantNeutralBorders = {};
		for (const [countryId, neighbors] of adjacencyCache.entries()) {
			if (!combatantIds.has(countryId)) continue;
			const neutralNeighbors = [];
			for (const nId of neighbors) {
				if (combatantIds.has(nId)) continue;
				neutralNeighbors.push(nId);
			}
			if (neutralNeighbors.length > 0) {
				combatantNeutralBorders[countryId] = new Set();
			}
		}

		// Full-grid scan to find frontier cells between combatants and neutrals
		if (Object.keys(combatantNeutralBorders).length > 0) {
			const total = gridWidth * gridHeight;
			for (let i = 0; i < total; i++) {
				if (landMask[i] !== 2) continue;
				const owner = worldControlMap[i];
				if (!combatantNeutralBorders[owner]) continue;
				const nb4 = [i + 1, i - 1, i + gridWidth, i - gridWidth];
				for (let nb = 0; nb < 4; nb++) {
					const ni = nb4[nb];
					if (ni < 0 || ni >= total) continue;
					if (landMask[ni] !== 2) continue;
					const nbOwner = worldControlMap[ni];
					if (nbOwner === 0 || nbOwner === owner) continue;
					if (!combatantIds.has(nbOwner)) {
						combatantNeutralBorders[owner].add(i);
						break;
					}
				}
			}

			for (const [countryId, cells] of Object.entries(
				combatantNeutralBorders,
			)) {
				if (cells.size === 0) continue;
				const poly = [];
				for (const idx of cells) {
					const y = Math.floor(idx / gridWidth);
					const x = idx % gridWidth;
					poly.push({
						lat: y * CONFIG.GRID_RES - 90,
						lng: x * CONFIG.GRID_RES - 180,
					});
				}
				_neutralBorderPolys[countryId] = poly;
			}
		}
	}

	const _t2 = performance.now();
	// Mid-War Recruitment (Steady, Land-Capped, and Underdog-Aware)
	sides.forEach((side, sIdx) => {
		side.forEach((country) => {
			const stats = countryStats.get(country.id);
			if (!stats) return;
			const aiProfile = aiCountryState.get(country.id) || null;

			const currentUnits = stats.units;
			const initialLand = country.initialCells || 1;
			const currentLand = stats.controlled;

			const supplyFailed = capitalLostCountries.has(country.id);
			// Increased army caps to accommodate the much higher frontline saturation requirements.
			const multiplier = parseFloat(densitySlider.value) || 1.0;
			// Less aggressive size scaling to allow large empires to maintain thick lines.
			const sizeFactor = Math.max(1, currentLand / 2000);
			const densityScale = 1.0 / sizeFactor ** 0.35;
			// Stronger city-based cap: more cities = more potential divisions in the field.
			const cityCount = countryToCityCount.get(country.id) || 0;
			const landCityMultiplier = 1 + cityCount * 0.12; // each city adds +12% to this country's cap (capped later by side limits)
			const landBasedCap = Math.max(
				8,
				Math.floor(
					currentLand *
						CONFIG.UNIT_DENSITY_FACTOR *
						1.5 *
						multiplier *
						densityScale *
						landCityMultiplier,
				),
			);
			const sideLimit = CONFIG.MAX_UNITS_PER_SIDE;

			// Flexible Limit: allow bigger armies but still clamp for performance
			const flexibleLimit =
				sideLimit * (1 + Math.min(3.0, currentLand / 4000 + cityCount * 0.15));
			let absoluteCap = Math.min(landBasedCap, flexibleLimit);
			if (aiProfile) {
				absoluteCap = Math.floor(absoluteCap * aiProfile.recruitCapMult);
			}

			// When manual manpower is set, allow recruiting up to the manpower-based cap
			const manualMP = manualSideManpower[sIdx];
			if (manualMP !== null) {
				absoluteCap = Math.max(
					absoluteCap,
					Math.floor(manualMP / CONFIG.UNIT_TO_SOLDIER_RATIO),
				);
			}

			// GODLY Buff: Higher cap and ignores flexible limits
			if (country.buffState === "godly") {
				absoluteCap = Math.max(absoluteCap, 3600);
			}

			// If the capital has fallen, supply is failing: drastically limit total fieldable troops
			if (supplyFailed) {
				absoluteCap = Math.min(absoluteCap, 5);
			}

			if (currentUnits < absoluteCap) {
				const controlRatio = currentLand / initialLand;
				const cityCountLocal = countryToCityCount.get(country.id) || 0;
				const cityBonus = 0.5 + cityCountLocal * 0.5; // Cities are a primary driver of recruitment speed

				// Manpower Scale: Diminishing returns on recruitment for massive nations
				// to prevent them from overwhelmingly flooding the screen with unit flags.
				const landRatio = currentLand / 2000; // Reference size
				const scaleFactor = Math.max(0.5, landRatio ** 0.4);

				// Underdog Bonus: help nations that have lost most of their land cycle recruits faster
				const underdogFactor =
					controlRatio < 0.4 ? (0.4 - controlRatio) * 2.0 : 0;

				// Annexation Urgency: once a country drops under 60% of its original land,
				// ramp recruitment up sharply the closer it gets to zero to avoid soft capitulations.
				const annexationUrgency =
					controlRatio < 0.6 ? (0.6 - controlRatio) * 4.0 : 0;
				const annexationMultiplier = 1 + annexationUrgency;

				// Faster baseline recruitment, heavily amplified by city count, underdog status,
				// and annexation urgency.
				const baseRecruitmentChance = 0.006;
				let recruitmentChance =
					baseRecruitmentChance *
					scaleFactor *
					(controlRatio + cityBonus + underdogFactor) *
					annexationMultiplier *
					multiplier;
				const mobilizationMult =
					simFrameCount < AI_MOBILIZATION.EARLY_TICKS
						? 1 +
							(AI_MOBILIZATION.EARLY_RECRUIT_MULT - 1) *
								(1 - simFrameCount / AI_MOBILIZATION.EARLY_TICKS)
						: 1;
				recruitmentChance *= mobilizationMult;
				if (aiProfile) recruitmentChance *= aiProfile.recruitChanceMult;

				if (country.buffState === "godly") {
					recruitmentChance *= 12.0; // 12x recruitment speed
				}

				// If the capital is lost, recruitment almost collapses
				if (supplyFailed) {
					recruitmentChance *= 0.1; // 90% reduction in new troops
				}

				if (Math.random() < recruitmentChance) {
					spawnSingleUnit(sIdx, country.id);
				}
			}
		});
	});

	// Precompute city list once per tick; URBAN strategy and global city‑focus both reuse this
	const globalCityTargets = activeTheaterCities?.length
		? activeTheaterCities
		: cities;

	// PERF: Pre-group cities by sovereignId once, instead of cities.filter() per-unit (was 4.3% self-time).
	_tickCitiesBySovereign.clear();
	const _citiesBySovereign = _tickCitiesBySovereign;
	if (cities?.length) {
		for (let ci = 0; ci < cities.length; ci++) {
			const c = cities[ci];
			const oid = c.ownerId || c.sovereignId || null;
			if (oid !== null) {
				let arr = _citiesBySovereign.get(oid);
				if (!arr) {
					arr = [];
					_citiesBySovereign.set(oid, arr);
				}
				arr.push(c);
			}
		}
	}

	// PERF: Pre-build Map<id, metadata> for O(1) lookup instead of countryMetadata.find() per-unit (was 1.5% self-time).
	_tickMetadataById.clear();
	const _metadataById = _tickMetadataById;
	for (let mi = 0; mi < countryMetadata.length; mi++) {
		const m = countryMetadata[mi];
		if (m && m.id !== undefined) _metadataById.set(m.id, m);
	}

	window.__perf.recruit += performance.now() - _t2;
	const _t3 = performance.now();
	// Pre-build city grid index Set once per tick (not per unit)
	const _cityIdxSetTick = new Set();
	for (let _cci = 0; _cci < activeTheaterCities.length; _cci++) {
		const _cIdx = getGridIndex(activeTheaterCities[_cci].lat, activeTheaterCities[_cci].lng);
		if (_cIdx !== -1) _cityIdxSetTick.add(_cIdx);
	}
	for (let i = units.length - 1; i >= 0; i--) {
		const u = units[i];

		// Scrub NaN units immediately to prevent rendering crashes
		if (Number.isNaN(u.lat) || Number.isNaN(u.lng)) {
			units.splice(i, 1);
			continue;
		}

		u.dirLat = 0;
		u.dirLng = 0; // Reset movement indicators for the current tick

		// Handle deployment/mobilization phase
		if (u.deployTicks > 0) {
			u.deployTicks--;
			continue; // Skip AI and movement while deploying
		}

		let sideIndex = u.sideIndex !== undefined ? u.sideIndex : 0;
		const gIdx = Math.floor(u.id * 1000) % numGroups;
		const centroids = sideCentroids[sideIndex];
		const groupCentroid = centroids ? centroids[gIdx] : null;

		// Ensure sideIndex is valid if sides were removed via capitulation
		if (sideIndex >= sides.length) sideIndex = sides.length - 1;
		if (sideIndex < 0) sideIndex = 0;

		// Sync index back to object for the renderer
		u.sideIndex = sideIndex;

		const sideList = sides[sideIndex];
		if (!sideList) continue;

		const countryObj = sideList.find((c) => c.id === u.sovereignId);
		const aiProfile = aiCountryState.get(u.sovereignId) || {
			mode: "NORMAL",
			retreatTriggerMultiple: 8.0,
			frontlineBlend: 0.35,
			speedMult: 1.0,
			targetCityWeight: 0.0,
			forceDefensive: false,
			reserveShare: 0.02,
			peacePressure: 0.0,
		};
		const isDefensive = countryObj?.strategy === "DEFENSIVE";
		const effectiveDefensive = isDefensive || aiProfile.forceDefensive;
		const _isUrban = countryObj?.strategy === "URBAN";
		const metaForBuff = _metadataById.get(u.sovereignId) || null;
		const effectiveBuff = getEffectiveBuffState(countryObj, metaForBuff);

		let damageDealtMult = 1.0;
		let damageTakenMult = 1.0;
		let speedBuffMult = 1.0;

		// Victory Boost Logic: Momentum Phase
		if (u.victoryBoostTicks > 0) {
			u.victoryBoostTicks--;
			damageDealtMult *= 1.4; // Reduced damage boost for longer battles
			speedBuffMult *= 1.3; // Reduced speed boost for slower pushing
		}

		// Capital Loss Penalty (Nerfed to prevent instant collapse of smaller nations)
		if (countryCapitalLost.has(u.sovereignId)) {
			damageDealtMult *= 0.8; // 20% reduction (was 35%)
			damageTakenMult *= 1.15; // 15% more vulnerable (was 25%)
			speedBuffMult *= 0.9; // 10% slower (was 20%)
		}

		const gridIdxNow = getGridIndex(u.lat, u.lng);
		const _uSideIdx = countryToSideMap.get(u.sovereignId);
		const isAtSea = gridIdxNow === -1 || landMask[gridIdxNow] === 0;
		const mountainIntensity =
			mountainsEnabled && gridIdxNow !== -1 ? terrainMask[gridIdxNow] : 0;
		const isMountain = mountainIntensity > 0;
		const currentControl = getControlValue(u.lat, u.lng);

		// Cache terrain and sea states for the renderer
		u.isAtSea = isAtSea;
		u.mountainIntensity = mountainIntensity;

		// Optional city‑focus movement target (does not affect combat logic)
		let cityFocusTarget = null;
		if (cityFocusMode && cityTargets?.length) {
			const _teamPole = u.sideIndex % 2 === 0 ? 1 : -1; // legacy placeholder
			let bestCity = null;
			let bestCityDistSq = Infinity;
			for (let cIdx = 0; cIdx < cityTargets.length; cIdx++) {
				const city = cityTargets[cIdx];
				const gIdx = getGridIndex(city.lat, city.lng);
				const ds = dominantSideMap[gIdx];
				const isGoodTarget = ds !== u.sideIndex;
				if (!isGoodTarget) continue;
				const dSq = (u.lat - city.lat) ** 2 + (u.lng - city.lng) ** 2;
				if (dSq < bestCityDistSq) {
					bestCityDistSq = dSq;
					bestCity = city;
				}
			}
			if (bestCity) {
				cityFocusTarget = { lat: bestCity.lat, lng: bestCity.lng };
			}
		}

		if (countryObj) {
			if (effectiveBuff === "buff") {
				damageDealtMult = 2.5;
				damageTakenMult = 0.6;
				speedBuffMult = 1.3;
			} else if (effectiveBuff === "super") {
				damageDealtMult = 10.0;
				damageTakenMult = 0.2;
				speedBuffMult = 1.8;
			} else if (effectiveBuff === "godly") {
				damageDealtMult = 40.0;
				damageTakenMult = 0.015;
				speedBuffMult = 2.2;
			} else if (effectiveBuff === "weakened") {
				damageDealtMult = 0.7;
				damageTakenMult = 1.4;
				speedBuffMult = 0.7; // slightly slower when weakened
			} else if (effectiveBuff === "crippled") {
				damageDealtMult = 0.4;
				damageTakenMult = 2.5;
				speedBuffMult = 0.7;
			}

			// Continuous attack/defense modifiers from sliders (-90% .. +90%)
			const atkPct =
				typeof countryObj.attackBuffPercent === "number"
					? countryObj.attackBuffPercent
					: 0;
			const defPct =
				typeof countryObj.defenseBuffPercent === "number"
					? countryObj.defenseBuffPercent
					: 0;
			const atkFactor = 1 + atkPct / 100;
			const defFactor = 1 + defPct / 100;
			if (atkFactor > 0) damageDealtMult *= atkFactor;
			// positive defPct reduces damageTaken (tougher), negative increases (softer)
			if (defFactor > 0.01) damageTakenMult *= 1 / defFactor;
		}

		// Terrain Modifiers: Mountains reduce speed and lethality based on intensity (size/scale)
		if (isMountain) {
			// Intensity 1.0 = full penalty, Intensity 0.1 = minimal penalty
			speedBuffMult *= 1.0 - 0.65 * mountainIntensity;
			damageDealtMult *= 1.0 - 0.4 * mountainIntensity;
			damageTakenMult *= 1.0 - 0.4 * mountainIntensity;
		}

		// Alpenjägers: small, quiet buffs with emphasis on mountain warfare
		if (u.isAlpenjager) {
			if (isMountain) {
				speedBuffMult *= CONFIG.ALPEN_MTN_SPEED_MULT;
			}
			damageDealtMult *= CONFIG.ALPEN_COMBAT_MULT;
			damageTakenMult *= 1.0 / CONFIG.ALPEN_COMBAT_MULT;
		}

		// Exile Disbandment: If a navy is at sea and its nation has lost all land, it slowly disbands
		if (isAtSea && countryObj) {
			const stats = countryStats.get(u.sovereignId);
			if (stats && stats.controlled === 0) {
				if (Math.random() < 0.02) {
					units.splice(i, 1);
					continue;
				}
			}
			// Non-transport units at sea take attrition until they reach land
			if (!u.isTransport) {
				recordDamage(u, CONFIG.ATTRITION_DAMAGE * 3.0);
			}
		}

		// --- ENCIRCLEMENT DETECTION ---
		let encirclementFactor = 0;
		const isMega = effectiveBuff === "super";
		const isSuper = effectiveBuff === "buff";
		const _isWeak = effectiveBuff === "weakened";
		const _isCripple = effectiveBuff === "crippled";

		if (!isAtSea && !isMega && !isSuper && gridIdxNow !== -1) {
			const eR = CONFIG.ENCIRCLEMENT_RADIUS;
			const eRCells = Math.round(eR / CONFIG.GRID_RES);
			const gw = gridWidth;
			const row = Math.floor(gridIdxNow / gw);
			const col = gridIdxNow % gw;
			const offsets = [
				[0, eRCells],
				[0, -eRCells],
				[eRCells, 0],
				[-eRCells, 0],
				[Math.round(eRCells * 0.7), Math.round(eRCells * 0.7)],
				[-Math.round(eRCells * 0.7), -Math.round(eRCells * 0.7)],
				[Math.round(eRCells * 0.7), -Math.round(eRCells * 0.7)],
				[-Math.round(eRCells * 0.7), Math.round(eRCells * 0.7)],
			];
			let enemyCount = 0;
			for (let oi = 0; oi < offsets.length; oi++) {
				const [dc, dr] = offsets[oi];
				const nr = row + dr;
				const nc = col + dc;
				if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gw) continue;
				const sIdx = nr * gw + nc;
				if (landMask[sIdx] > 0 && isEnemyTerritory(sIdx, u.sideIndex))
					enemyCount++;
			}
			encirclementFactor = enemyCount / offsets.length;
		}
		const isEncircled = encirclementFactor > 0.75;

		if (isEncircled && !isMega && !isSuper) {
			damageDealtMult *= 0.25; // Massive reduction in combat effectiveness
			damageTakenMult *= 4.0; // Extremely vulnerable to attacks
		}

		// Attrition logic: logistics strain increases the further you push into large nations
		const inEnemyTerritory =
			!isAtSea && isEnemyTerritory(gridIdxNow, u.sideIndex);

		// Attrition is disabled during Victory Boost (momentum) to prevent breakthroughs from stalling instantly
		if (
			(inEnemyTerritory || isEncircled) &&
			!isMega &&
			!isSuper &&
			(u.victoryBoostTicks <= 0 || isEncircled)
		) {
			// Logistics Strain: Attrition scales with the target's total land area
			let targetLandSize = 0;
			const enemySideIndices = sides
				.map((_, idx) => idx)
				.filter((idx) => idx !== sideIndex);
			enemySideIndices.forEach((idx) => {
				sides[idx].forEach((enemy) => {
					const s = countryStats.get(enemy.id);
					if (s) targetLandSize += s.controlled;
				});
			});

			const logisticsPenalty = Math.max(
				1,
				Math.log10(targetLandSize / 500 + 1),
			);
			// War Fatigue: Attrition damage scales with war duration, wearing out enemies over time
			const warFatigueFactor = 1.0 + simFrameCount / 8000;
			let dmg =
				CONFIG.ATTRITION_DAMAGE *
				(1 + Math.abs(currentControl) * 3) *
				logisticsPenalty *
				warFatigueFactor;

			if (isEncircled) dmg *= CONFIG.ENCIRCLEMENT_DAMAGE_MULT;
			recordDamage(u, dmg * damageTakenMult);

			// Instant death triggers full remaining health as casualties
			if (isEncircled && Math.random() < 0.025) {
				recordDamage(u, u.health);
			}
		}

		// --- EXPEDITIONARY SUPPORT SYSTEM ---
		const role = countryObj?.role || "OFFENSE";
		const alliesMetadata = sideList.filter((c) => c.id !== u.sovereignId);
		const offensiveAllies = alliesMetadata.filter((c) => c.role === "OFFENSE");

		if (role === "SUPPORT") {
			if (offensiveAllies.length > 0) {
				if (
					!u.beneficiaryId ||
					u.beneficiaryId === u.sovereignId ||
					!offensiveAllies.some((a) => a.id === u.beneficiaryId)
				) {
					u.beneficiaryId =
						offensiveAllies[
							Math.floor(Math.random() * offensiveAllies.length)
						].id;
				}
			} else if (alliesMetadata.length > 0) {
				if (!u.beneficiaryId || u.beneficiaryId === u.sovereignId) {
					u.beneficiaryId =
						alliesMetadata[
							Math.floor(Math.random() * alliesMetadata.length)
						].id;
				}
			} else {
				u.beneficiaryId = u.sovereignId;
			}
		} else {
			// Offensive units: Drastically reduced chance to randomly wander off to support allies (like Britain to Canada)
			// unless their sovereign land is almost entirely occupied.
			const myStats = countryStats.get(u.sovereignId);
			const myInitial = countryObj?.initialCells || 1;
			const beingOverrun = myStats
				? myStats.controlled < myInitial * 0.3
				: false;

			// Significantly reduced probability to wander to an ally's territory (0.02% per frame)
			if (
				!beingOverrun &&
				Math.random() < 0.0002 &&
				alliesMetadata.length > 0
			) {
				u.beneficiaryId =
					alliesMetadata[Math.floor(Math.random() * alliesMetadata.length)].id;
			} else if (Math.random() < 0.12 || !u.beneficiaryId) {
				// High chance to reset to sovereign target to ensure focus on the main theater
				u.beneficiaryId = u.sovereignId;
			}
		}

		// Tactical Awareness: Identify enemies and local balance of power using O(1) Spatial Hash
		let target = null;
		let minDist = Infinity;
		let retreatVector = null;

		const tacticalRadiusSq = 0.6 * 0.6;
		const repulsionRadiusSq = 0.45 * 0.45;
		let localEnemyCount = 0;
		let localAllyCount = 1;
		let enemyCentroidLat = 0;
		let enemyCentroidLng = 0;

		// At high sim speeds, skip tactical awareness for units far from combat
		// to reduce the 3×3 spatial-hash neighbor iteration cost (~5-10% CPU at 5×).
		const idleTicks = simFrameCount - (u.lastCombatTick || 0);
		const isTacticallyIdle =
			simSpeed >= 3 &&
			idleTicks > 60 &&
			u.mopUpTargetId === 0 &&
			!u.cityFocusTarget;

		const isRebelUnit =
			activeRebellion && u.sovereignId === activeRebellion.rebelId;
		const _isAlpen = !!u.isAlpenjager;

		if (cityFocusTarget) {
			target = cityFocusTarget;
			minDist =
				(u.lat - cityFocusTarget.lat) ** 2 + (u.lng - cityFocusTarget.lng) ** 2;
		}

		const kx = Math.floor((u.lng + 180) / HASH_SIZE);
		const ky = Math.floor((u.lat + 90) / HASH_SIZE);
		const maxKx = Math.ceil(360 / HASH_SIZE);

		// Only search adjacent 3x3 hash cells (approx 6x6 degrees footprint).
		// Skip for tactically idle units at high sim speeds to reduce CPU load.
		if (!isTacticallyIdle) {
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					let cx = kx + dx;
					const cy = ky + dy;

					if (cx < 0) cx += maxKx;
					else if (cx >= maxKx) cx -= maxKx;

					const arr = unitHash.get(cx * 10000 + cy);
					if (!arr) continue;

					for (let j = 0; j < arr.length; j++) {
						const e = arr[j];
						if (e === u) continue;

						const isEnemy = e.sideIndex !== sideIndex;

						let deLng = e.lng - u.lng;
						if (deLng > 180) deLng -= 360;
						else if (deLng < -180) deLng += 360;

						const dSq = (u.lat - e.lat) ** 2 + deLng ** 2;

						if (isEnemy) {
							const eIdx = _unitGridIdx.get(e) ?? -1;
							const eAtSea = eIdx === -1 || landMask[eIdx] === 0;

							if ((effectiveDefensive || isRebelUnit) && !isAtSea) {
								const isEnemyInMyMandatedLand =
									eIdx !== -1 &&
									(isRebelUnit
										? deJureMap[eIdx] === u.sovereignId
										: worldControlMap[eIdx] === u.sovereignId);
								if (!isEnemyInMyMandatedLand && dSq > 0.09) continue;
							}

							const distMult = eAtSea && !isAtSea ? 50.0 : 1.0;
							const noise = Math.sin(u.id + simFrameCount * 0.02) * 0.03;
							const noisyDSq =
								((u.lat - e.lat + noise) ** 2 + (deLng + noise) ** 2) *
								distMult;

							if (noisyDSq < minDist) {
								minDist = noisyDSq;
								target = e;
							}

							if (dSq < tacticalRadiusSq) {
								let eWeight = 1;
								if (eAtSea) eWeight *= isAtSea ? 0.6 : 0.2;

								const eSideIdx = countryToSideMap.get(e.sovereignId);
								const eCountry =
									eSideIdx !== undefined
										? _countryById.get(e.sovereignId)
										: null;

								if (eCountry?.buffState === "super") eWeight *= 200;
								else if (eCountry?.buffState === "buff") eWeight *= 50;

								localEnemyCount += eWeight;
								enemyCentroidLat += e.lat * eWeight;
								enemyCentroidLng += e.lng * eWeight;

								if (dSq < 0.04) {
									const inWarGrace = simFrameCount < warGraceEndTick;
									if (inWarGrace) continue;
									let proximityDamage =
										CONFIG.COMBAT_DAMAGE *
										0.07 *
										damageDealtMult *
										(1.0 - Math.sqrt(dSq) / 0.2);
									if (isAtSea && eAtSea) proximityDamage *= 2.2;
									// Transports take extra damage at sea from non-transport enemies
									if (e.isTransport && !u.isTransport) proximityDamage *= 1.5;
									if (u.isTransport && !e.isTransport) {
										recordDamage(u, proximityDamage * 1.2 * damageTakenMult, e);
										proximityDamage *= 0.7;
									}

									recordDamage(e, proximityDamage, u);
									recordDamage(u, proximityDamage * 0.8 * damageTakenMult, e);

									u.lastCombatTick = simFrameCount;
									e.lastCombatTick = simFrameCount;
									if (e.health <= 0) u.victoryBoostTicks = 240;

									const battleLat = (u.lat + e.lat) / 2;
									const battleLng = (u.lng + e.lng) / 2;
									const bKey = Math.round(battleLat * 10) + ',' + Math.round(battleLng * 10);
									let existing = null;
									for (let bk = -1; bk <= 1 && !existing; bk++) {
										for (let bl = -1; bl <= 1 && !existing; bl++) {
											const nk = Math.round(battleLat * 10) + bk + ',' + (Math.round(battleLng * 10) + bl);
											const bi = _battleHash.get(nk);
											if (bi !== undefined) {
												const b = activeBattles[bi];
												if (b && (u.lat - b.lat) ** 2 + (u.lng - b.lng) ** 2 < 0.16) existing = b;
											}
										}
									}
									if (existing) {
										existing.participants++;
										existing.lat =
											(existing.lat * (existing.participants - 1) + battleLat) /
											existing.participants;
										existing.lng =
											(existing.lng * (existing.participants - 1) + battleLng) /
											existing.participants;
										const newKey = Math.round(existing.lat * 10) + ',' + Math.round(existing.lng * 10);
										if (newKey !== bKey) _battleHash.set(newKey, activeBattles.indexOf(existing));
									} else {
										const idx = activeBattles.push({ lat: battleLat, lng: battleLng, participants: 2 }) - 1;
										_battleHash.set(bKey, idx);
									}
								}
							}
						} else if (
							!u.navalAssigned &&
							!u.supplyAssigned &&
							!u.coastalAssigned
						) {
							// Neutral garrison: station along borders with neutrals
							let bestGP = null;
							let bestGPDist = Infinity;
							for (let gsi = _uSideIdx * 10; gsi < _uSideIdx * 10 + 10; gsi++) {
								const gp = _neutralGarrisonPlan[gsi];
								if (!gp || gp.type !== "NEUTRAL_GARRISON") continue;
								if ((gp.activeUnitCount || 0) >= (gp.maxAssignedUnits || 0))
									continue;
								if (!gp.borderPolyline || gp.borderPolyline.length === 0)
									continue;
								const dLat = gp.target.lat - u.lat;
								let dLng = gp.target.lng - u.lng;
								if (dLng > 180) dLng -= 360;
								else if (dLng < -180) dLng += 360;
								const dSq = dLat * dLat + dLng * dLng;
								if (dSq < 256.0 && dSq < bestGPDist) {
									bestGPDist = dSq;
									bestGP = gp;
								}
							}

							if (u.garrisonAssigned) {
								let foundGP = false;
								for (let gsi = _uSideIdx * 10; gsi < _uSideIdx * 10 + 10; gsi++) {
									const gp = _neutralGarrisonPlan[gsi];
									if (
										!gp ||
										gp.type !== "NEUTRAL_GARRISON" ||
										!gp.borderPolyline ||
										gp.borderPolyline.length === 0
									)
										continue;
									const dLat = gp.target.lat - u.lat;
									let dLng = gp.target.lng - u.lng;
									if (dLng > 180) dLng -= 360;
									else if (dLng < -180) dLng += 360;
									if (dLat * dLat + dLng * dLng < 256.0) {
										foundGP = true;
										isPlanUnit = true;
										gp.activeUnitCount = (gp.activeUnitCount || 0) + 1;
										const slot =
											gp.borderPolyline[
												Math.floor(
													Math.abs(u.id * 777) % gp.borderPolyline.length,
												)
											];
										const sLat = slot.lat - u.lat;
										let sLng = slot.lng - u.lng;
										if (sLng > 180) sLng -= 360;
										else if (sLng < -180) sLng += 360;
										const sDist = Math.sqrt(sLat * sLat + sLng * sLng);
										if (sDist > 0.01) {
											planDirLat = sLat / sDist;
											planDirLng = sLng / sDist;
										}
										planSpeedMult = 0.5;
										moveDirLat = 0;
										moveDirLng = 0;
										break;
									}
								}
								if (!foundGP) {
									u.garrisonAssigned = false;
								}
							} else if (bestGP) {
								u.garrisonAssigned = true;
							}
						} else if (!u.navalAssigned && !u.supplyAssigned) {
							// Coastal defense: station units along vulnerable coastlines
							let bestCDPlan = null;
							let bestCDSlot = -1;
							let bestCDDist = Infinity;
							for (let csi = _uSideIdx * 10; csi < _uSideIdx * 10 + 10; csi++) {
								const cp = _coastalDefensePlan[csi];
								if (!cp || cp.type !== "COASTAL_DEFENSE") continue;
								if ((cp.activeUnitCount || 0) >= (cp.maxAssignedUnits || 0))
									continue;
								if (!cp.target) continue;
								const dLat = cp.target.lat - u.lat;
								let dLng = cp.target.lng - u.lng;
								if (dLng > 180) dLng -= 360;
								else if (dLng < -180) dLng += 360;
								const dSq = dLat * dLat + dLng * dLng;
								if (dSq < 64.0 && dSq < bestCDDist) {
									bestCDDist = dSq;
									bestCDPlan = cp;
									bestCDSlot = csi;
								}
							}

							if (u.coastalAssigned) {
								let foundCD = false;
								for (let csi = _uSideIdx * 10; csi < _uSideIdx * 10 + 10; csi++) {
									const cp = _coastalDefensePlan[csi];
									if (
										!cp ||
										cp.type !== "COASTAL_DEFENSE" ||
										!cp.zonePolyline ||
										cp.zonePolyline.length === 0
									)
										continue;
									const sdLat = cp.target.lat - u.lat;
									let sdLng = cp.target.lng - u.lng;
									if (sdLng > 180) sdLng -= 360;
									else if (sdLng < -180) sdLng += 360;
									if (sdLat * sdLat + sdLng * sdLng < 64.0) {
										foundCD = true;
										isPlanUnit = true;
										cp.activeUnitCount = (cp.activeUnitCount || 0) + 1;
										const threatActive =
											cp.threatContact &&
											simFrameCount - (cp.threatenedTick || 0) < 900;
										if (threatActive) {
											const tLat = cp.threatContact.lat - u.lat;
											let tLng = cp.threatContact.lng - u.lng;
											if (tLng > 180) tLng -= 360;
											else if (tLng < -180) tLng += 360;
											const tDist = Math.sqrt(tLat * tLat + tLng * tLng);
											if (tDist > 0.01) {
												planDirLat = tLat / tDist;
												planDirLng = tLng / tDist;
											}
											planSpeedMult = 1.5;
										} else {
											const slot =
												cp.zonePolyline[
													Math.floor(
														Math.abs(u.id * 777) % cp.zonePolyline.length,
													)
												];
											const sLat = slot.lat - u.lat;
											let sLng = slot.lng - u.lng;
											if (sLng > 180) sLng -= 360;
											else if (sLng < -180) sLng += 360;
											const sDist = Math.sqrt(sLat * sLat + sLng * sLng);
											if (sDist > 0.01) {
												planDirLat = sLat / sDist;
												planDirLng = sLng / sDist;
											}
											planSpeedMult = 0.5;
										}
										moveDirLat = 0;
										moveDirLng = 0;
										break;
									}
								}
								if (!foundCD) {
									u.coastalAssigned = false;
								}
							} else if (bestCDPlan) {
								u.coastalAssigned = true;
								_coastalDefensePlan[bestCDSlot]._slotIdx = bestCDSlot;
							}
						} else {
							// Allies logic
							if (dSq < tacticalRadiusSq) {
								let aWeight = 1;
								const aSideIdx = countryToSideMap.get(e.sovereignId);
								const aCountry =
									aSideIdx !== undefined
										? _countryById.get(e.sovereignId)
										: null;
								if (aCountry?.buffState === "super") aWeight *= 200;
								else if (aCountry?.buffState === "buff") aWeight *= 50;

								localAllyCount += aWeight;

								if (dSq < repulsionRadiusSq && dSq > 0.00001) {
									const d = Math.sqrt(dSq);
									if (!u.repulsionVector)
										u.repulsionVector = { lat: 0, lng: 0 };
									u.repulsionVector.lat += (u.lat - e.lat) / d;
									u.repulsionVector.lng += (u.lng - e.lng) / d;
								}
							}
						}
					}
				}
			}
		} // !isTacticallyIdle

		u.lastAllyCount = localAllyCount;

		// Retreat logic: If enemy force is > 5x ally force (increased threshold to prevent premature dodging)
		if (
			localEnemyCount > localAllyCount * aiProfile.retreatTriggerMultiple &&
			localEnemyCount >= 5
		) {
			const avgLat = enemyCentroidLat / localEnemyCount;
			const avgLng = enemyCentroidLng / localEnemyCount;
			const dirLat = u.lat - avgLat;
			const dirLng = u.lng - avgLng;
			const mag = Math.sqrt(dirLat * dirLat + dirLng * dirLng);
			if (mag > 0) {
				retreatVector = { lat: dirLat / mag, lng: dirLng / mag };
			}
		}

		const collapsedEnemyNations = sideToCollapsedNations[sideIndex] || [];

		const targetIdx = target ? getGridIndex(target.lat, target.lng) : -1;
		const _targetAtSea =
			target && (targetIdx === -1 || landMask[targetIdx] === 0);

		const totalEnemiesCount = units.length - unitsBySide[sideIndex].length;

		const pocketContained =
			localEnemyCount > 0 && localAllyCount > localEnemyCount * 3;

		// Global Target Fallback (if no enemies were found in the local 6-degree spatial hash but enemies exist somewhere)
		if (!target && !cityFocusTarget && totalEnemiesCount > 0) {
			let bestCentroidDist = Infinity;
			sideCentroids.forEach((centroids, idx) => {
				const isEnemySide = idx !== sideIndex;
				if (isEnemySide && centroids) {
					centroids.forEach((c) => {
						if (!c) return;
						let dcLng = c.lng - u.lng;
						if (dcLng > 180) dcLng -= 360;
						else if (dcLng < -180) dcLng += 360;
						const dSq = (u.lat - c.lat) ** 2 + dcLng ** 2;
						if (dSq < bestCentroidDist) {
							bestCentroidDist = dSq;
							target = c;
						}
					});
				}
			});
		}

		// Unified behavior: Units hunt enemies when nearby, but switch to focused territory capture (mop-up)
		// when there are literally zero enemy units remaining.
		const shouldMopUp = totalEnemiesCount === 0;

		// Target Caching: Only re-search for mop-up targets every few ticks to save CPU
		if (u.targetSearchCooldown > 0) {
			u.targetSearchCooldown--;
		}

		// Frontline Pressure: If unit is too close to a moving/losing border, push it back
		const borderBuffer = -0.05; // Tightened buffer to prevent endless retreating / stuttering
		const currentIdx = gridIdxNow;
		const currentOwnerId = currentIdx !== -1 ? worldControlMap[currentIdx] : 0;
		const currentOwnerSideIdx = countryToSideMap.get(currentOwnerId);

		// Tactical Control: If we significantly occupy the land, it's not "enemy land" for movement purposes
		// Broadened "friendly" land check to make units wait further back from the actual border
		const isEffectivelyMyLand =
			isMyTerritory(gridIdxNow, u.sideIndex) &&
			myInfluenceAt(gridIdxNow, u.sideIndex) > 0.35;
		const _isOnEnemyLand =
			!isEffectivelyMyLand &&
			currentOwnerSideIdx !== undefined &&
			currentOwnerSideIdx !== sideIndex;

		// Mega and Super units are immune to the automatic pushback; they ARE the pushback.
		// BUG FIX: Units were being "pushed back" and taking skirmish damage even when attacking into enemy land.
		// Pushback now only triggers if the unit is on friendly/sovereign territory that is being overrun by enemies.
		const ownerIdAtUnit = currentIdx !== -1 ? worldControlMap[currentIdx] : 0;
		const ownerSideIdx = countryToSideMap.get(ownerIdAtUnit);
		const onFriendlySovereignLand =
			ownerSideIdx !== undefined && ownerSideIdx === sideIndex;

		const isTooNearBorder =
			!isAtSea &&
			!isMega &&
			!isSuper &&
			onFriendlySovereignLand &&
			currentIdx !== -1 &&
			landMask[currentIdx] === 2 &&
			myInfluenceAt(currentIdx, u.sideIndex) < borderBuffer &&
			localEnemyCount > 0;

		// Direction toward nearby frontline (used to pull units to the border instead of roaming)
		const borderDir = getBorderDirection(u);

		if (isTooNearBorder && !isAtSea) {
			// Frontline Skirmish Damage: Being pushed back by an advancing border is taxing and represents rear-guard casualties
			const skirmishDamage =
				CONFIG.COMBAT_DAMAGE * 0.15 * (1.0 + Math.abs(currentControl) * 2);
			recordDamage(u, skirmishDamage * damageTakenMult);

			// Find direction of safety (deeper into friendly territory) by sampling nearby grid
			let bestLat = 0,
				bestLng = 0,
				bestVal = -Infinity;
			const sDist = 0.6;
			const samples = [
				[0, sDist],
				[0, -sDist],
				[sDist, 0],
				[-sDist, 0],
				[sDist * 0.7, sDist * 0.7],
				[-sDist * 0.7, -sDist * 0.7],
				[sDist * 0.7, -sDist * 0.7],
				[-sDist * 0.7, sDist * 0.7],
			];

			samples.forEach(([dlng, dlat]) => {
				const sampleLat = u.lat + dlat;
				const sampleLng = u.lng + dlng;
				const sIdx = getGridIndex(sampleLat, sampleLng);
				const isSampleLand = sIdx !== -1 && landMask[sIdx] > 0;

				let score = myInfluenceAt(sIdx, u.sideIndex);

				const sampleOwnerId = sIdx !== -1 ? worldControlMap[sIdx] : 0;
				const isSampleAlly = sideList.some((c) => c.id === sampleOwnerId);

				if (!isSampleLand) {
					score = -999;
				} else if (sIdx !== -1 && isNeutralCountry(sIdx)) {
					score = -2500;
				} else if (!isSampleAlly) {
					score = -800;
				}

				if (score > bestVal) {
					bestVal = score;
					bestLat = dlat;
					bestLng = dlng;
				}
			});

			if (bestVal !== -Infinity) {
				const mag = Math.sqrt(bestLat * bestLat + bestLng * bestLng);
				if (mag > 0) {
					if (!retreatVector) retreatVector = { lat: 0, lng: 0 };
					retreatVector.lat += (bestLat / mag) * 1.2;
					retreatVector.lng += (bestLng / mag) * 1.2;
				}
			}
		}

		if (shouldMopUp) {
			// Mop-up mode: Enemy has no units or target is far and collapsed nations exist
			let enemyId = -1;
			const isRebel =
				activeRebellion && u.sovereignId === activeRebellion.rebelId;

			if (isRebel) {
				// REBELS: Target their own de jure land exclusively
				enemyId = u.sovereignId;
			} else if (effectiveDefensive) {
				// DEFENSIVE: Target own nation to find occupied cells to reclaim
				enemyId = u.sovereignId;
			} else if (collapsedEnemyNations.length > 0) {
				// If there are multiple collapsed nations, prioritize the first few (which are sorted by OFFENSE role)
				const candidates = collapsedEnemyNations.slice(0, 3);
				enemyId = candidates[Math.floor(Math.random() * candidates.length)].id;
			} else {
				const possibleEnemySides = sides
					.filter((_s, idx) => idx !== sideIndex)
					.filter((s) => s.length > 0);

				if (possibleEnemySides.length > 0) {
					const randomEnemySide =
						possibleEnemySides[
							Math.floor(Math.random() * possibleEnemySides.length)
						];
					const randomEnemyCountry =
						randomEnemySide[Math.floor(Math.random() * randomEnemySide.length)];
					enemyId = randomEnemyCountry?.id || -1;
				}
			}

			// If supporting an ally and no enemies nearby, move towards their frontlines
			// Only actually go to the ally if that ally is losing land (has occupation)
			let activeSupportTarget = null;
			if (u.beneficiaryId !== u.sovereignId) {
				const ally = sideList.find((c) => c.id === u.beneficiaryId);
				const allyStats = countryStats.get(u.beneficiaryId);
				const allyInitial = ally?.initialCells || 1;
				// Only support allies that are at least 5% occupied to prevent unnecessary wandering
				if (ally && allyStats && allyStats.controlled < allyInitial * 0.95) {
					activeSupportTarget = ally;
				} else {
					// Force redirect back to sovereign/enemy goals if ally is safe
					u.beneficiaryId = u.sovereignId;
				}
			}

			const needsNewTarget =
				!u.mopUpTarget ||
				u.targetSearchCooldown <= 0 ||
				(u.lastMopUpId &&
					u.lastMopUpId !==
						(activeSupportTarget ? activeSupportTarget.id : enemyId));

			if (needsNewTarget) {
				u.targetSearchCooldown = 15 + Math.floor(Math.random() * 20); // 0.25s - 0.6s cache
				const targetId = activeSupportTarget ? activeSupportTarget.id : enemyId;
				u.lastMopUpId = targetId;
				let bestCellIdx = -1;
				let bestScore = -Infinity;

				const _relLat = groupCentroid ? u.lat - groupCentroid.lat : 0;
				const _relLng = groupCentroid ? u.lng - groupCentroid.lng : 0;

				for (let j = 0; j < 250; j++) {

				// Pre-build city grid index Set for O(1) lookups in mop-up loop
				const _cityIdxSet = new Set();
				for (let ci = 0; ci < activeTheaterCities.length; ci++) {
					const cIdx = getGridIndex(activeTheaterCities[ci].lat, activeTheaterCities[ci].lng);
					if (cIdx !== -1) _cityIdxSet.add(cIdx);
				}
					if (isRebel) {
						if (deJureAtIdx === activeRebellion.rebelId) {
							if (dominantSideMap[randIdx] !== u.sideIndex) isCandidate = true;
						}
					} else if (ownerAtIdx === targetId) {
						if (effectiveDefensive) {
							if (dominantSideMap[randIdx] !== u.sideIndex) isCandidate = true;
						} else {
							if (dominantSideMap[randIdx] !== u.sideIndex) isCandidate = true;
						}
					}

					if (isCandidate) {
						const cy = Math.floor(randIdx / gridWidth);
						const cx = randIdx % gridWidth;
						const cLat = cy * CONFIG.GRID_RES - 90;
						const cLng = cx * CONFIG.GRID_RES - 180;

						// Hive Sector Logic: Bias groups toward specific geographic arcs to create organized fronts
						const sectorAngle = (gIdx / numGroups) * Math.PI * 2;
						const sectorLat = Math.sin(sectorAngle) * 45;
						const sectorLng = Math.cos(sectorAngle) * 45;

						// Distance to assigned squad sector
						const sectorDistSq =
							(cLat - sectorLat) ** 2 + (cLng - sectorLng) ** 2;
						const sectorBias = Math.max(0, 100 - sectorDistSq * 0.05);

						let dcLng = cLng - u.lng;
						if (dcLng > 180) dcLng -= 360;
						else if (dcLng < -180) dcLng += 360;

						const distSq = (u.lat - cLat) ** 2 + dcLng ** 2;
						const occ = occupationMap[randIdx];
						const occFavor = (1.0 - Math.abs(occ)) * 120;

						// URBAN strategy: heavily reward cells that contain cities to create road‑like thrusts
						let cityBias = 0;
						if (countryObj?.strategy === "URBAN") {
							const hasCityHere = _cityIdxSetTick.has(randIdx);
							if (hasCityHere) cityBias = 450;
						}

						// Combinatorial score: Proximity + Frontline Freshness + Squad Sector Focus + City priority
						let score = occFavor - distSq * 0.4 + sectorBias + cityBias;

						// ALASKA & ARCTIC PENALTY: Discourage units from roaming to Alaska or far north islands
						// when Fighting in North America. This forces them to prioritize the Mainland US/Canada borders.
						const isAlaska = cLat > 54 && cLng < -130;
						const isArctic = cLat > 65;

						if (isAlaska) score -= 1500;
						if (isArctic) score -= 800;

						// MAINLAND THEATER BOOST: Encourage units to target "The Heartland" (Lower 48 / Europe core)
						if (cLat > 25 && cLat < 50 && cLng > -125 && cLng < -65)
							score += 200; // US Mainland
						if (cLat > 35 && cLat < 60 && cLng > -10 && cLng < 40) score += 200; // Europe Core

						if (score > bestScore) {
							bestScore = score;
							bestCellIdx = randIdx;
						}
					}
				}

				if (bestCellIdx !== -1) {
					const y = Math.floor(bestCellIdx / gridWidth);
					const x = bestCellIdx % gridWidth;
					u.mopUpTarget = {
						lat: y * CONFIG.GRID_RES - 90,
						lng: x * CONFIG.GRID_RES - 180,
					};
				} else {
					// Fallback: If no priority cells found, target ANY cell of the target nation.
					// This prevents units (especially defensive or weakened ones) from freezing when priority targets are gone.
					for (let j = 0; j < 80; j++) {
						const randIdx = Math.floor(Math.random() * worldControlMap.length);
						if (worldControlMap[randIdx] === targetId) {
							const y = Math.floor(randIdx / gridWidth);
							const x = randIdx % gridWidth;
							u.mopUpTarget = {
								lat: y * CONFIG.GRID_RES - 90,
								lng: x * CONFIG.GRID_RES - 180,
							};
							break;
						}
					}
				}
			}
			target = u.mopUpTarget;
		}

		// Objective hierarchy: in desperation modes, bias toward meaningful enemy cities
		// (especially capitals) instead of purely nearest-unit chasing.
		if (
			!shouldMopUp &&
			aiProfile.targetCityWeight > 0 &&
			globalCityTargets?.length
		) {
			let bestCity = null;
			let bestScore = -Infinity;
			for (let ci = 0; ci < globalCityTargets.length; ci++) {
				const c = globalCityTargets[ci];
				const cOwner = c.sovereignId || c.ownerId || 0;
				const cSide = countryToSideMap.get(cOwner);
				if (cSide === undefined) continue;
				const isEnemyCity = cSide !== sideIndex;
				if (!isEnemyCity) continue;

				let dlng = c.lng - u.lng;
				if (dlng > 180) dlng -= 360;
				else if (dlng < -180) dlng += 360;
				const dSq = (u.lat - c.lat) ** 2 + dlng ** 2;
				const _occ = getControlValue(c.lat, c.lng);
				const cityIdx = getGridIndex(c.lat, c.lng);
				const contested = myInfluenceAt(cityIdx, u.sideIndex) < 0.35;

				let score = -(dSq * 0.6);
				if (contested) score += 120;
				if (c.isCapital) score += 260;
				if (score > bestScore) {
					bestScore = score;
					bestCity = c;
				}
			}

			if (bestCity) {
				if (target && target.lat !== undefined && target.lng !== undefined) {
					const w = aiProfile.targetCityWeight;
					target = {
						lat: target.lat * (1 - w) + bestCity.lat * w,
						lng: target.lng * (1 - w) + bestCity.lng * w,
					};
				} else {
					target = { lat: bestCity.lat, lng: bestCity.lng };
				}
			}
		}

		// CITY-FOCUS COMBAT MODE:
		// When enabled, AI movement targeting prioritizes cities as primary objectives,
		// using unit positions only for local combat/retreat decisions.
		if (cityFocusMode && cityFocusTarget) {
			target = cityFocusTarget;
		}

		if (target) {
			// Spatial Jitter: Add a small, unit-specific offset to the target destination
			// to prevent multiple units from converging on the exact same coordinate.
			const jitterScale = 0.08;
			const jitterLat = target.lat + Math.sin(u.id * 100) * jitterScale;
			const jitterLng = target.lng + Math.cos(u.id * 100) * jitterScale;

			const dLat = jitterLat - u.lat;
			let dLng = jitterLng - u.lng;

			// GLOBAL WRAP: Shortest path around the world
			if (dLng > 180) dLng -= 360;
			else if (dLng < -180) dLng += 360;

			const dist = Math.sqrt(dLat * dLat + dLng * dLng);

			const isEngaged =
				u.lastCombatTick && simFrameCount - u.lastCombatTick < 2;
			if (dist > 0.05 && !isEngaged) {
				// Movement logic
				const baseSpeed = isAtSea ? CONFIG.UNIT_NAVAL_SPEED : CONFIG.UNIT_SPEED;

				// Roaming Prevention: Removed exploratory wiggle to force a focused linear push
				const landSpeedBuff =
					!isAtSea &&
					isMyTerritory(gridIdxNow, u.sideIndex) &&
					myInfluenceAt(gridIdxNow, u.sideIndex) > 0.5
						? 1.8
						: 1.2;
				const speedMult = landSpeedBuff * speedBuffMult * aiProfile.speedMult;

				let moveDirLat = dLat / dist;
				let moveDirLng = dLng / dist;

				// ── War Plan Movement: override direction based on active plan ──
				let planSpeedMult = 1.0;
				let planDirLat = 0,
					planDirLng = 0,
					isPlanUnit = false;
				let activePlan = _warPlan[u.sideIndex];
				// Land slot 2: pick the closer offensive plan if one exists
				const slot2Plan = _warPlan[u.sideIndex + sides.length];
				if (slot2Plan && slot2Plan.type !== "DEFEND") {
					const d1 = activePlan?.target
						? (activePlan.target.lat - u.lat) ** 2 +
							Math.min(
								Math.abs(((activePlan.target.lng - u.lng + 540) % 360) - 180),
								180,
							) **
								2
						: Infinity;
					const d2 = slot2Plan.target
						? (slot2Plan.target.lat - u.lat) ** 2 +
							Math.min(
								Math.abs(((slot2Plan.target.lng - u.lng + 540) % 360) - 180),
								180,
							) **
								2
						: Infinity;
					if (d2 < d1) activePlan = slot2Plan;
				}
				const navalPlan = _navalPlan[u.sideIndex];
				const supplyPlan = _navalSupplyPlan[u.sideIndex];

				// Naval plan assignment: if this unit is close to staging coast and
				// the naval plan needs units, recruit it
				let isNavalUnit = false;
				if (
					navalPlan &&
					navalPlan.type === "NAVAL_INVASION" &&
					!shouldMopUp &&
					!retreatVector &&
					!isEngaged &&
					!u.garrisonAssigned &&
					(navalPlan.activeUnitCount || 0) < (navalPlan.maxAssignedUnits || 0)
				) {
					if (u.navalAssigned) {
						isNavalUnit = true;
					} else {
						const sdLat = navalPlan.stagingPoint.lat - u.lat;
						let sdLng = navalPlan.stagingPoint.lng - u.lng;
						if (sdLng > 180) sdLng -= 360;
						else if (sdLng < -180) sdLng += 360;
						const sdSq = sdLat * sdLat + sdLng * sdLng;
						if (sdSq < 4.0) {
							// Within ~2 degrees of staging coast AND on friendly territory
							const uGI = _unitGridIdx.get(u);
							if (uGI === -1 || dominantSideMap[uGI] !== u.sideIndex) continue;
							u.navalAssigned = true;
							isNavalUnit = true;
						}
					}
				}

				if (
					isNavalUnit &&
					navalPlan &&
					(navalPlan.activeUnitCount || 0) < (navalPlan.maxAssignedUnits || 0)
				) {
					isPlanUnit = true;
					navalPlan.activeUnitCount = (navalPlan.activeUnitCount || 0) + 1;
					u.isTransport = true;

					if (navalPlan.phase === "GATHERING") {
						// Move toward staging point on friendly coast
						const sdLat = navalPlan.stagingPoint.lat - u.lat;
						let sdLng = navalPlan.stagingPoint.lng - u.lng;
						if (sdLng > 180) sdLng -= 360;
						else if (sdLng < -180) sdLng += 360;
						const sd = Math.sqrt(sdLat * sdLat + sdLng * sdLng);
						if (sd > 0.01) {
							planDirLat = sdLat / sd;
							planDirLng = sdLng / sd;
						}
						planSpeedMult = 2.0;
					} else if (navalPlan.phase === "EMBARKATION") {
						// Move toward nearest water tile
						if (!isAtSea) {
							// Find nearest water cell
							let bestWDist = Infinity;
							let bestWLat = 0;
							let bestWLng = 0;
							const r = Math.floor((u.lat + 90) / CONFIG.GRID_RES);
							const c = Math.floor((u.lng + 180) / CONFIG.GRID_RES);
							for (let dr = -3; dr <= 3; dr++) {
								for (let dc = -3; dc <= 3; dc++) {
									const nr = r + dr;
									const nc = c + dc;
									if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth)
										continue;
									const ni = nr * gridWidth + nc;
									if (landMask[ni] !== 0) continue;
									const wlat = nr * CONFIG.GRID_RES - 90;
									const wlng = nc * CONFIG.GRID_RES - 180;
									let ddLng = wlng - u.lng;
									if (ddLng > 180) ddLng -= 360;
									else if (ddLng < -180) ddLng += 360;
									const dd = (u.lat - wlat) ** 2 + ddLng ** 2;
									if (dd < bestWDist) {
										bestWDist = dd;
										bestWLat = wlat;
										bestWLng = wlng;
									}
								}
							}
							if (bestWDist < Infinity) {
								const dd = Math.sqrt(bestWDist);
								planDirLat = (bestWLat - u.lat) / dd;
								let ddLng = bestWLng - u.lng;
								if (ddLng > 180) ddLng -= 360;
								else if (ddLng < -180) ddLng += 360;
								planDirLng = ddLng / dd;
							}
						}
						planSpeedMult = 2.0;
					} else if (navalPlan.phase === "TRANSIT") {
						// Sail toward target coast with mild land avoidance
						const tdLat = navalPlan.target.lat - u.lat;
						let tdLng = navalPlan.target.lng - u.lng;
						if (tdLng > 180) tdLng -= 360;
						else if (tdLng < -180) tdLng += 360;
						const td = Math.sqrt(tdLat * tdLat + tdLng * tdLng);
						if (td > 0.01) {
							planDirLat = tdLat / td;
							planDirLng = tdLng / td;
							const lookDist = CONFIG.UNIT_NAVAL_SPEED * 2;
							const checkLat = u.lat + planDirLat * lookDist;
							const checkLng = u.lng + planDirLng * lookDist;
							const checkIdx = getGridIndex(checkLat, checkLng);
							if (checkIdx !== -1 && landMask[checkIdx] > 0) {
								let bestDLat = planDirLat;
								let bestDLng = planDirLng;
								let bestScore = -Infinity;
								for (const ang of [-30, 30, -60, 60]) {
									const rad = (ang * Math.PI) / 180;
									const nx =
										planDirLat * Math.cos(rad) - planDirLng * Math.sin(rad);
									const ny =
										planDirLat * Math.sin(rad) + planDirLng * Math.cos(rad);
									let wc = 0;
									for (let s = 1; s <= 3; s++) {
										const si = getGridIndex(
											u.lat + nx * lookDist * s,
											u.lng + ny * lookDist * s,
										);
										if (si === -1 || landMask[si] === 0) wc++;
									}
									const dotProduct = nx * planDirLat + ny * planDirLng;
									const score = wc * 2 + dotProduct * 3;
									if (wc > 0 && score > bestScore) {
										bestScore = score;
										bestDLat = nx;
										bestDLng = ny;
									}
								}
								planDirLat = bestDLat;
								planDirLng = bestDLng;
								const mag = Math.sqrt(
									planDirLat * planDirLat + planDirLng * planDirLng,
								);
								if (mag > 0) {
									planDirLat /= mag;
									planDirLng /= mag;
								}
							}
						}
						planSpeedMult = 2.5;
					} else if (navalPlan.phase === "LANDING") {
						// Push inland from landing point
						u.isTransport = false;
						const tdLat = navalPlan.target.lat - u.lat;
						let tdLng = navalPlan.target.lng - u.lng;
						if (tdLng > 180) tdLng -= 360;
						else if (tdLng < -180) tdLng += 360;
						const td = Math.sqrt(tdLat * tdLat + tdLng * tdLng);
						if (td > 0.01) {
							planDirLat = tdLat / td;
							planDirLng = tdLng / td;
						}
						planSpeedMult = 1.5;
					}
					navalPlan.progress = isAtSea
						? 0.5
						: navalPlan.phase === "LANDING"
							? 0.8
							: 0.3;
					moveDirLat = 0;
					moveDirLng = 0;
				} else if (
					supplyPlan &&
					supplyPlan.type === "NAVAL_SUPPLY" &&
					!shouldMopUp &&
					!retreatVector &&
					!isEngaged &&
					!u.garrisonAssigned &&
					!u.navalAssigned &&
					(supplyPlan.activeUnitCount || 0) < (supplyPlan.maxAssignedUnits || 0)
				) {
					// Supply plan assignment
					let isSupplyUnit = false;
					if (u.supplyAssigned) {
						isSupplyUnit = true;
					} else {
						const sdLat = supplyPlan.stagingPoint.lat - u.lat;
						let sdLng = supplyPlan.stagingPoint.lng - u.lng;
						if (sdLng > 180) sdLng -= 360;
						else if (sdLng < -180) sdLng += 360;
						const sdSq = sdLat * sdLat + sdLng * sdLng;
						if (sdSq < 64.0) {
							u.supplyAssigned = true;
							isSupplyUnit = true;
						}
					}

					if (isSupplyUnit) {
						isPlanUnit = true;
						supplyPlan.activeUnitCount = (supplyPlan.activeUnitCount || 0) + 1;
						u.isTransport = true;

						if (supplyPlan.phase === "GATHERING") {
							const sdLat = supplyPlan.stagingPoint.lat - u.lat;
							let sdLng = supplyPlan.stagingPoint.lng - u.lng;
							if (sdLng > 180) sdLng -= 360;
							else if (sdLng < -180) sdLng += 360;
							const sd = Math.sqrt(sdLat * sdLat + sdLng * sdLng);
							if (sd > 0.01) {
								planDirLat = sdLat / sd;
								planDirLng = sdLng / sd;
							}
							planSpeedMult = 2.0;
						} else if (supplyPlan.phase === "EMBARKATION" && !isAtSea) {
							let bestWDist = Infinity;
							let bestWLat = 0;
							let bestWLng = 0;
							const r = Math.floor((u.lat + 90) / CONFIG.GRID_RES);
							const c = Math.floor((u.lng + 180) / CONFIG.GRID_RES);
							for (let dr = -3; dr <= 3; dr++) {
								for (let dc = -3; dc <= 3; dc++) {
									const nr = r + dr;
									const nc = c + dc;
									if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth)
										continue;
									const ni = nr * gridWidth + nc;
									if (landMask[ni] !== 0) continue;
									const wlat = nr * CONFIG.GRID_RES - 90;
									const wlng = nc * CONFIG.GRID_RES - 180;
									let ddLng = wlng - u.lng;
									if (ddLng > 180) ddLng -= 360;
									else if (ddLng < -180) ddLng += 360;
									const dd = (u.lat - wlat) ** 2 + ddLng ** 2;
									if (dd < bestWDist) {
										bestWDist = dd;
										bestWLat = wlat;
										bestWLng = wlng;
									}
								}
							}
							if (bestWDist < Infinity) {
								const dd = Math.sqrt(bestWDist);
								planDirLat = (bestWLat - u.lat) / dd;
								let ddLng = bestWLng - u.lng;
								if (ddLng > 180) ddLng -= 360;
								else if (ddLng < -180) ddLng += 360;
								planDirLng = ddLng / dd;
							}
							planSpeedMult = 2.0;
						} else if (supplyPlan.phase === "TRANSIT") {
							const tdLat = supplyPlan.target.lat - u.lat;
							let tdLng = supplyPlan.target.lng - u.lng;
							if (tdLng > 180) tdLng -= 360;
							else if (tdLng < -180) tdLng += 360;
							const td = Math.sqrt(tdLat * tdLat + tdLng * tdLng);
							if (td > 0.01) {
								planDirLat = tdLat / td;
								planDirLng = tdLng / td;
								const lookDist = CONFIG.UNIT_NAVAL_SPEED * 2;
								const checkLat = u.lat + planDirLat * lookDist;
								const checkLng = u.lng + planDirLng * lookDist;
								const checkIdx = getGridIndex(checkLat, checkLng);
								if (checkIdx !== -1 && landMask[checkIdx] > 0) {
									let bestDLat = planDirLat;
									let bestDLng = planDirLng;
									let bestScore = -Infinity;
									for (const ang of [-30, 30, -60, 60]) {
										const rad = (ang * Math.PI) / 180;
										const nx =
											planDirLat * Math.cos(rad) - planDirLng * Math.sin(rad);
										const ny =
											planDirLat * Math.sin(rad) + planDirLng * Math.cos(rad);
										let wc = 0;
										for (let s = 1; s <= 3; s++) {
											const si = getGridIndex(
												u.lat + nx * lookDist * s,
												u.lng + ny * lookDist * s,
											);
											if (si === -1 || landMask[si] === 0) wc++;
										}
										const dotProduct = nx * planDirLat + ny * planDirLng;
										const score = wc * 2 + dotProduct * 3;
										if (wc > 0 && score > bestScore) {
											bestScore = score;
											bestDLat = nx;
											bestDLng = ny;
										}
									}
									planDirLat = bestDLat;
									planDirLng = bestDLng;
									const mag = Math.sqrt(
										planDirLat * planDirLat + planDirLng * planDirLng,
									);
									if (mag > 0) {
										planDirLat /= mag;
										planDirLng /= mag;
									}
								}
							}
							planSpeedMult = 2.5;
						} else if (supplyPlan.phase === "DELIVERED") {
							u.isTransport = false;
							const tdLat = supplyPlan.target.lat - u.lat;
							let tdLng = supplyPlan.target.lng - u.lng;
							if (tdLng > 180) tdLng -= 360;
							else if (tdLng < -180) tdLng += 360;
							const td = Math.sqrt(tdLat * tdLat + tdLng * tdLng);
							if (td > 0.01) {
								planDirLat = tdLat / td;
								planDirLng = tdLng / td;
							}
							planSpeedMult = 1.5;
						}
						moveDirLat = 0;
						moveDirLng = 0;
					} else {
						// Not a supply unit — clear supply flag
						u.supplyAssigned = false;
					}
					// Defender reaction: move toward enemy landing if assigned (independent of supply)
					if (
						!isPlanUnit &&
						u._defenderReactTarget &&
						!shouldMopUp &&
						!retreatVector &&
						!isEngaged
					) {
						isPlanUnit = true;
						const rdLat = u._defenderReactTarget.lat - u.lat;
						let rdLng = u._defenderReactTarget.lng - u.lng;
						if (rdLng > 180) rdLng -= 360;
						else if (rdLng < -180) rdLng += 360;
						const rd = Math.sqrt(rdLat * rdLat + rdLng * rdLng);
						if (rd < 1.0) {
							u._defenderReactTarget = null;
						} else {
							planDirLat = rdLat / rd;
							planDirLng = rdLng / rd;
							planSpeedMult = 2.0;
						}
						moveDirLat = 0;
						moveDirLng = 0;
					}
				} else {
					u.navalAssigned = false;
					u.isTransport = false;

					// DEFEND plan: hold the frontline, do not advance
					if (
						activePlan &&
						activePlan.type === "DEFEND" &&
						!isEngaged &&
						!shouldMopUp &&
						!retreatVector
					) {
						isPlanUnit = true;
						activePlan.activeUnitCount = (activePlan.activeUnitCount || 0) + 1;
						// Check if unit is behind or at the frontline (on our side)
						const unitIdx = gridIdxNow;
						const onOurSide =
							unitIdx !== -1 && dominantSideMap[unitIdx] === u.sideIndex;
						const nearFrontline =
							borderDir &&
							Math.sqrt(
								borderDir.lat * borderDir.lat + borderDir.lng * borderDir.lng,
							) > 0;
						if (onOurSide && nearFrontline) {
							// Hold position near the frontline, don't advance
							moveDirLat = 0;
							moveDirLng = 0;
						} else if (!onOurSide) {
							// Unit drifted past the frontline — pull it back
							// Move toward nearest friendly territory
							let bestFRDist = Infinity;
							let bestFRLat = 0;
							let bestFRLng = 0;
							const r = Math.floor((u.lat + 90) / CONFIG.GRID_RES);
							const c = Math.floor((u.lng + 180) / CONFIG.GRID_RES);
							for (let dr = -5; dr <= 5; dr++) {
								for (let dc = -5; dc <= 5; dc++) {
									const nr = r + dr;
									const nc = c + dc;
									if (nr < 0 || nr >= gridHeight || nc < 0 || nc >= gridWidth)
										continue;
									const ni = nr * gridWidth + nc;
									if (dominantSideMap[ni] !== u.sideIndex) continue;
									const flat = nr * CONFIG.GRID_RES - 90;
									const flng = nc * CONFIG.GRID_RES - 180;
									let fdLng = flng - u.lng;
									if (fdLng > 180) fdLng -= 360;
									else if (fdLng < -180) fdLng += 360;
									const fd = (u.lat - flat) ** 2 + fdLng ** 2;
									if (fd < bestFRDist) {
										bestFRDist = fd;
										bestFRLat = flat;
										bestFRLng = flng;
									}
								}
							}
							if (bestFRDist < Infinity) {
								const d = Math.sqrt(bestFRDist);
								moveDirLat = (bestFRLat - u.lat) / d;
								let fdLng = bestFRLng - u.lng;
								if (fdLng > 180) fdLng -= 360;
								else if (fdLng < -180) fdLng += 360;
								moveDirLng = fdLng / d;
							}
						}
					}

					// Defender reaction: move toward enemy landing if assigned
					if (
						u._defenderReactTarget &&
						!shouldMopUp &&
						!retreatVector &&
						!isEngaged
					) {
						isPlanUnit = true;
						const rdLat = u._defenderReactTarget.lat - u.lat;
						let rdLng = u._defenderReactTarget.lng - u.lng;
						if (rdLng > 180) rdLng -= 360;
						else if (rdLng < -180) rdLng += 360;
						const rd = Math.sqrt(rdLat * rdLat + rdLng * rdLng);
						if (rd < 1.0) {
							u._defenderReactTarget = null;
						} else {
							planDirLat = rdLat / rd;
							planDirLng = rdLng / rd;
							planSpeedMult = 2.0;
						}
						moveDirLat = 0;
						moveDirLng = 0;
					}

					// Only apply plan when safe: no nearby enemies, not engaged, not retreating
					if (
						!shouldMopUp &&
						!retreatVector &&
						!isEngaged &&
						(localEnemyCount < 2 || pocketContained) &&
						activePlan &&
						activePlan.type !== "DEFEND"
					) {
						const planFull = false;
						if (!planFull) {
							isPlanUnit = true;
							if (activePlan.activeUnitCount !== undefined) {
								activePlan.activeUnitCount++;
							}

							if (
								activePlan.phase === "PREPARATION" &&
								activePlan.stagingCells?.length > 0
							) {
								// Rally to staging cells at 2× speed
								const staging = activePlan.stagingCells;
								const sc =
									staging[
										Math.floor(Math.abs(u.id * 1000000) % staging.length)
									];
								if (sc) {
									const pdLat = sc.lat - u.lat;
									let pdLng = sc.lng - u.lng;
									if (pdLng > 180) pdLng -= 360;
									else if (pdLng < -180) pdLng += 360;
									const pd = Math.sqrt(pdLat * pdLat + pdLng * pdLng);
									if (pd > 0.01) {
										planDirLat = pdLat / pd;
										planDirLng = pdLng / pd;
									}
									planSpeedMult = 2.0;
								}
								// Zero out target direction so plan dominates; skip combat engagement
								moveDirLat = 0;
								moveDirLng = 0;
							} else if (
								activePlan.phase === "EXECUTION" &&
								activePlan.target
							) {
								const pdLat = activePlan.target.lat - u.lat;
								let pdLng = activePlan.target.lng - u.lng;
								if (pdLng > 180) pdLng -= 360;
								else if (pdLng < -180) pdLng += 360;
								const pd = Math.sqrt(pdLat * pdLat + pdLng * pdLng);

								if (activePlan.type === "ENCIRCLE") {
									const role = u.id % 3;
									if (role === 0) {
										// Pin: hold position, minimal advance
										if (pd > 0.01) {
											planDirLat = pdLat / pd;
											planDirLng = pdLng / pd;
										}
										planSpeedMult = 0.4;
									} else {
										// Flank: curve around pocket at breakthrough speed
										const flankAngle = role === 1 ? -70 : 70;
										const rad = (flankAngle * Math.PI) / 180;
										if (pd > 0.01) {
											const nx = pdLat / pd,
												ny = pdLng / pd;
											planDirLat = nx * Math.cos(rad) - ny * Math.sin(rad);
											planDirLng = nx * Math.sin(rad) + ny * Math.cos(rad);
										}
										planSpeedMult = 2.0;
									}
								} else {
									// CAPTURE_CITY / PUSH_FRONT: breakthrough push with spearhead variation
									if (pd > 0.01) {
										planDirLat = pdLat / pd;
										planDirLng = pdLng / pd;
									}
									const spearhead =
										0.8 + (Math.sin(u.id * 777) * 0.5 + 0.5) * 0.8;
									planSpeedMult = 2.0 * spearhead;
								}
								activePlan.progress = Math.min(
									1.0,
									Math.max(0, 1.0 - pd / 5.0),
								);
								// Zero out target direction so plan dominates; units follow the plan
								moveDirLat = 0;
								moveDirLng = 0;
							} else if (
								activePlan.phase === "CONSOLIDATION" &&
								activePlan.target
							) {
								// Spread outward from captured objective toward new frontline
								let bestDist = Infinity;
								let bestLat = 0,
									bestLng = 0;
								for (const fk of Object.keys(_frontlinePolys || {})) {
									const [fa, fb] = fk.split("_").map(Number);
									if (fa !== u.sideIndex && fb !== u.sideIndex) continue;
									const poly = _frontlinePolys[fk];
									if (!poly) continue;
									const idx = Math.floor(
										Math.abs(u.id * 777 + simFrameCount) % poly.length,
									);
									const fc = poly[idx];
									let fLng = fc.lng - u.lng;
									if (fLng > 180) fLng -= 360;
									else if (fLng < -180) fLng += 360;
									const dSq = (fc.lat - u.lat) ** 2 + fLng ** 2;
									if (dSq < bestDist) {
										bestDist = dSq;
										bestLat = fc.lat;
										bestLng = fc.lng;
									}
								}
								if (bestDist < Infinity && bestDist > 0.0001) {
									const d = Math.sqrt(bestDist);
									planDirLat = (bestLat - u.lat) / d;
									planDirLng = (bestLng - u.lng) / d;
									planSpeedMult = 1.5;
								}
								// During consolidation, zero out target direction so plan dominates
								moveDirLat = 0;
								moveDirLng = 0;
							}
						}
					}
				} // end else (non-naval land plan)

				// Blend plan direction into movement
				if (isPlanUnit && (planDirLat !== 0 || planDirLng !== 0)) {
					const planBlend = 1.0;
					moveDirLat = moveDirLat * (1 - planBlend) + planDirLat * planBlend;
					moveDirLng = moveDirLng * (1 - planBlend) + planDirLng * planBlend;
					const magP = Math.sqrt(
						moveDirLat * moveDirLat + moveDirLng * moveDirLng,
					);
					if (magP > 0) {
						moveDirLat /= magP;
						moveDirLng /= magP;
					}
				}

				// Front-slot positioning: pull toward assigned frontline slot
				// Disabled during staging phases and for DEFEND plans (they hold the line)
				if (
					u.frontSlot &&
					!shouldMopUp &&
					!retreatVector &&
					!isEngaged &&
					(!activePlan ||
						(activePlan.phase !== "PREPARATION" &&
							activePlan.phase !== "CONSOLIDATION")) &&
					activePlan?.type !== "DEFEND"
				) {
					const sdLat = u.frontSlot.targetLat - u.lat;
					let sdLng = u.frontSlot.targetLng - u.lng;
					if (sdLng > 180) sdLng -= 360;
					else if (sdLng < -180) sdLng += 360;
					const sdDist = Math.sqrt(sdLat * sdLat + sdLng * sdLng);
					if (sdDist > 0.01) {
						const slotStrength = Math.min(0.6, dist * 2);
						moveDirLat =
							moveDirLat * (1 - slotStrength) + (sdLat / sdDist) * slotStrength;
						moveDirLng =
							moveDirLng * (1 - slotStrength) + (sdLng / sdDist) * slotStrength;
						const magSlot = Math.sqrt(
							moveDirLat * moveDirLat + moveDirLng * moveDirLng,
						);
						if (magSlot > 0) {
							moveDirLat /= magSlot;
							moveDirLng /= magSlot;
						}
					}
				}

				// Pull towards nearby frontline — disabled when plan is driving the unit
				if (
					borderDir &&
					!isAtSea &&
					!isPlanUnit &&
					(!activePlan ||
						(activePlan.phase !== "PREPARATION" &&
							activePlan.phase !== "CONSOLIDATION"))
				) {
					// Force units to prioritize the frontline even more heavily to prevent the "interior roaming" seen in clusters.
					const blendStrength = aiProfile.frontlineBlend;
					moveDirLat =
						moveDirLat * (1 - blendStrength) + borderDir.lat * blendStrength;
					moveDirLng =
						moveDirLng * (1 - blendStrength) + borderDir.lng * blendStrength;
					const magBorder = Math.sqrt(
						moveDirLat * moveDirLat + moveDirLng * moveDirLng,
					);
					if (magBorder > 0) {
						moveDirLat /= magBorder;
						moveDirLng /= magBorder;
					}
				}

				// Apply tactical retreat/border pushback
				let activeRetreat = false;
				if (retreatVector) {
					const rMag = Math.sqrt(
						retreatVector.lat ** 2 + retreatVector.lng ** 2,
					);
					if (rMag > 0) {
						activeRetreat = true;
						const rDirLat = retreatVector.lat / rMag;
						const rDirLng = retreatVector.lng / rMag;

						// Blend target direction with retreat direction
						// Reduced retreat strength so units don't "dodge" and sprint away entirely,
						// allowing them to keep some forward pressure while backing off.
						const inHostileLand = isEnemyTerritory(gridIdxNow, u.sideIndex);
						const retreatStrength = inHostileLand ? 0.4 : 0.25;

						moveDirLat =
							moveDirLat * (1 - retreatStrength) + rDirLat * retreatStrength;
						moveDirLng =
							moveDirLng * (1 - retreatStrength) + rDirLng * retreatStrength;

						const finalMag = Math.sqrt(moveDirLat ** 2 + moveDirLng ** 2);
						if (finalMag > 0) {
							moveDirLat /= finalMag;
							moveDirLng /= finalMag;
						}
					}
				}

				// Hive Cohesion & Alignment: Units stick with their squad and move in unison
				if (groupCentroid && !isAtSea && !activeRetreat) {
					// 1. Cohesion: Pull towards squad center
					const dCentLat = groupCentroid.lat - u.lat;
					const dCentLng = groupCentroid.lng - u.lng;
					const dCentDist = Math.sqrt(
						dCentLat * dCentLat + dCentLng * dCentLng,
					);
					if (dCentDist > 0.1) {
						const cohesionStr = 0.15;
						moveDirLat += (dCentLat / dCentDist) * cohesionStr;
						moveDirLng += (dCentLng / dCentDist) * cohesionStr;
					}

					// 2. Alignment: Match squad's average heading
					if (
						Math.abs(groupCentroid.vLat) > 0.01 ||
						Math.abs(groupCentroid.vLng) > 0.01
					) {
						const alignStr = 0.25;
						moveDirLat += groupCentroid.vLat * alignStr;
						moveDirLng += groupCentroid.vLng * alignStr;
					}

					const newMag = Math.sqrt(
						moveDirLat * moveDirLat + moveDirLng * moveDirLng,
					);
					if (newMag > 0) {
						moveDirLat /= newMag;
						moveDirLng /= newMag;
					}
				}

				// Apply allied repulsion to ensure units spread out to borders
				// Suppression check: Repulsion is disabled during active retreats to prioritize survival
				if (u.repulsionVector && !activeRetreat) {
					const rMag = Math.sqrt(
						u.repulsionVector.lat ** 2 + u.repulsionVector.lng ** 2,
					);
					if (rMag > 0) {
						// Less aggressive repulsion so units keep their forward momentum and don't scatter sideways
						const repulsionStrength = 0.4;
						moveDirLat =
							moveDirLat * (1 - repulsionStrength) +
							(u.repulsionVector.lat / rMag) * repulsionStrength;
						moveDirLng =
							moveDirLng * (1 - repulsionStrength) +
							(u.repulsionVector.lng / rMag) * repulsionStrength;
						const finalMag = Math.sqrt(moveDirLat ** 2 + moveDirLng ** 2);
						if (finalMag > 0) {
							moveDirLat /= finalMag;
							moveDirLng /= finalMag;
						}
					}
					u.repulsionVector = null;
				}

				// Guided Pathfinding: Priority-based Corridor Seeking
				// Actively detours around neutral nations (like Czechoslovakia) to find internal routes.
				const isProtectedSupport = (idx) => {
					if (idx === -1 || landMask[idx] === 0) return false;
					const cellOwnerId = worldControlMap[idx];
					const ownerSideIdx = countryToSideMap.get(cellOwnerId);
					if (ownerSideIdx === undefined) return false;
					const isEnemySupport =
						ownerSideIdx !== sideIndex &&
						role === "OFFENSE" &&
						sides[ownerSideIdx].find((c) => c.id === cellOwnerId)?.role ===
							"SUPPORT";
					if (isEnemySupport) {
						return myInfluenceAt(idx, u.sideIndex) <= 0.1;
					}
					return false;
				};

				// OPT-3: Only re-evaluate the neutral boundary check when the unit has
				// moved far enough from the last check position (>= 0.5 grid cells).
				// The expensive 24–48 angle sweep is skipped on intermediate ticks.
				const NEUTRAL_CHECK_DIST_SQ = (CONFIG.GRID_RES * 0.5) ** 2;
				const lastNeutralLat = u._neutralCheckLat;
				const lastNeutralLng = u._neutralCheckLng;
				const movedEnoughForNeutralCheck =
					lastNeutralLat === undefined ||
					(u.lat - lastNeutralLat) ** 2 + (u.lng - lastNeutralLng) ** 2 >=
						NEUTRAL_CHECK_DIST_SQ;

				// Only treat enemy SUPPORT nations as blocked for pathfinding; pure neutral countries are pass‑through.
				const isInsideNeutralProtected = isProtectedSupport(currentIdx);
				// Dynamic lookahead: units stuck inside or near neutral territory look further to find a valid corridor.
				const lookAheadDist = isNeutralCountry(currentIdx)
					? 1.6
					: isNeutralCountry(
								getGridIndex(
									u.lat + moveDirLat * 0.25,
									u.lng + moveDirLng * 0.25,
								),
							)
						? 1.2
						: 0.6;

				const lookIdx = getGridIndex(
					u.lat + moveDirLat * lookAheadDist,
					u.lng + moveDirLng * lookAheadDist,
				);

				const lookAheadIsNeutral = lookIdx !== -1 && isNeutralCountry(lookIdx);

				if (
					(isProtectedSupport(lookIdx) ||
						isInsideNeutralProtected ||
						lookAheadIsNeutral) &&
					movedEnoughForNeutralCheck
				) {
					// Record position so we don't re-sweep until the unit moves again
					u._neutralCheckLat = u.lat;
					u._neutralCheckLng = u.lng;

					// Impending neutral border or already inside. Try to "pathfind" a local corridor that stays off neutral land.
					let bestLat = moveDirLat;
					let bestLng = moveDirLng;
					let foundFriendly = false;

					// Local corridor search: sweep angles and check both mid‑point and end‑point cells
					// so we don't just step over a single neutral cell but actually route around it.
					const sweepSteps = 24;
					const sweepAngle = Math.PI; // 180° left/right around current heading
					const corridorLook = lookAheadDist;
					const midFactor = 0.5;

					for (let j = 1; j <= sweepSteps; j++) {
						const angleOff = (sweepAngle / sweepSteps) * j;

						for (let sign = -1; sign <= 1; sign += 2) {
							const a = angleOff * sign;
							const curCos = Math.cos(a);
							const curSin = Math.sin(a);

							// Candidate direction
							const candLat = moveDirLat * curCos - moveDirLng * curSin;
							const candLng = moveDirLat * curSin + moveDirLng * curCos;

							// Sample mid‑point along this direction
							const midLat = u.lat + candLat * corridorLook * midFactor;
							const midLng = u.lng + candLng * corridorLook * midFactor;
							const midIdx = getGridIndex(midLat, midLng);

							// Sample end‑point along this direction
							const endLat = u.lat + candLat * corridorLook;
							const endLng = u.lng + candLng * corridorLook;
							const endIdx = getGridIndex(endLat, endLng);

							const midBlocked =
								midIdx !== -1 &&
								(isNeutralCountry(midIdx) || isProtectedSupport(midIdx));
							const endBlocked =
								endIdx !== -1 &&
								(isNeutralCountry(endIdx) || isProtectedSupport(endIdx));

							// We only accept directions where both mid and end are non‑neutral/non‑protected land.
							if (
								endIdx !== -1 &&
								landMask[endIdx] > 0 &&
								!midBlocked &&
								!endBlocked
							) {
								bestLat = candLat;
								bestLng = candLng;
								foundFriendly = true;
								break;
							}
						}
						if (foundFriendly) break;
					}

					if (!foundFriendly) {
						// Second pass: search a slightly larger ring to get around wider neutral "blocks"
						const farLook = corridorLook * 1.6;
						for (let j = 1; j <= sweepSteps && !foundFriendly; j++) {
							const angleOff = (sweepAngle / sweepSteps) * j;

							for (let sign = -1; sign <= 1; sign += 2) {
								const a = angleOff * sign;
								const curCos = Math.cos(a);
								const curSin = Math.sin(a);

								const candLat = moveDirLat * curCos - moveDirLng * curSin;
								const candLng = moveDirLat * curSin + moveDirLng * curCos;

								const midLat = u.lat + candLat * farLook * midFactor;
								const midLng = u.lng + candLng * farLook * midFactor;
								const midIdx = getGridIndex(midLat, midLng);

								const endLat = u.lat + candLat * farLook;
								const endLng = u.lng + candLng * farLook;
								const endIdx = getGridIndex(endLat, endLng);

								const midBlocked =
									midIdx !== -1 &&
									(isNeutralCountry(midIdx) || isProtectedSupport(midIdx));
								const endBlocked =
									endIdx !== -1 &&
									(isNeutralCountry(endIdx) || isProtectedSupport(endIdx));

								if (
									endIdx !== -1 &&
									landMask[endIdx] > 0 &&
									!midBlocked &&
									!endBlocked
								) {
									bestLat = candLat;
									bestLng = candLng;
									foundFriendly = true;
									break;
								}
							}
						}
					}

					if (foundFriendly) {
						const mag = Math.sqrt(bestLat ** 2 + bestLng ** 2);
						if (mag > 0) {
							moveDirLat = bestLat / mag;
							moveDirLng = bestLng / mag;
						}
						// Cache the resolved direction so intermediate ticks reuse it
						u._neutralDirLat = moveDirLat;
						u._neutralDirLng = moveDirLng;
						u._neutralBlocked = false;
					} else {
						// No safe corridor that avoids neutral/protected land – do not move this tick
						// so units hold their line instead of drifting through neutral territory.
						moveDirLat = 0;
						moveDirLng = 0;
						u._neutralDirLat = 0;
						u._neutralDirLng = 0;
						u._neutralBlocked = true;
					}
				} else if (
					(isProtectedSupport(lookIdx) ||
						isInsideNeutralProtected ||
						lookAheadIsNeutral) &&
					!movedEnoughForNeutralCheck
				) {
					// Reuse cached corridor result from last sweep
					if (u._neutralBlocked) {
						moveDirLat = 0;
						moveDirLng = 0;
					} else if (u._neutralDirLat !== undefined) {
						moveDirLat = u._neutralDirLat;
						moveDirLng = u._neutralDirLng;
					}
				} else {
					// No longer near neutral — clear cached state so next encounter is fresh
					u._neutralCheckLat = undefined;
					u._neutralDirLat = undefined;
					u._neutralDirLng = undefined;
					u._neutralBlocked = undefined;
				}

				// Neutral / protected territory: heavy penalty to discourage traversal.
				// Units should path around neutral countries, not through them.
				let neutralPenalty = 1.0;
				let touchingNeutralForNaval = false;

				const currentlyInNeutral =
					isNeutralCountry(currentIdx) || isProtectedSupport(currentIdx);

				if (currentlyInNeutral) {
					if (!Number.isNaN(u.health)) {
						const neutralTickDamage =
							CONFIG.ATTRITION_DAMAGE * 2.0 * damageTakenMult;
						recordDamage(u, neutralTickDamage);
					}
					neutralPenalty = 0.15;
				} else if (isAtSea) {
					// For naval units, treat upcoming neutral coastline as contact for minor attrition
					const coastLookDist = 0.4;
					const coastIdx = getGridIndex(
						u.lat + moveDirLat * coastLookDist,
						u.lng + moveDirLng * coastLookDist,
					);
					if (isNeutral(coastIdx) || isProtectedSupport(coastIdx)) {
						touchingNeutralForNaval = true;
						// Ships skimming neutral coasts also move a bit faster along them
						neutralPenalty = 1.1;
					}
				}

				// Naval neutral-contact damage: greatly reduced, just a tiny scrape while near neutral coasts
				if (isAtSea && touchingNeutralForNaval && !Number.isNaN(u.health)) {
					const neutralHitDamage =
						CONFIG.ATTRITION_DAMAGE * 0.1 * damageTakenMult;
					recordDamage(u, neutralHitDamage);
				}

				// Massive speed boost when actively retreating to avoid being swallowed by fast borders
				// BUT trapped/encircled units cannot retreat efficiently
				let retreatBoost = activeRetreat ? 5.5 : 1.0;
				if (isEncircled) retreatBoost *= 0.05;

				// --- FORCED PUSH COORDINATION (Victory-Driven) ---
				// Disabled when a war/naval plan is driving the unit
				let pushReadiness = 1.0;
				const isAtFrontline =
					!isAtSea && !isEffectivelyMyLand && !isTooNearBorder;
				const warWeariness = Math.min(0.85, simFrameCount / 15000);

				if (
					!isPlanUnit &&
					isAtFrontline &&
					!isMega &&
					!isSuper &&
					!activeRetreat
				) {
					const victoryRatio = sideVictoryRatios[sideIndex] || 0;

					if (countryObj?.isSurging) {
						const spearheadAggression =
							0.5 + (Math.sin(u.id * 777) * 0.5 + 0.5);
						const momentumScale = Math.min(1.8, victoryRatio * 2.5);
						pushReadiness = 4.2 * momentumScale * spearheadAggression;
						pushReadiness *= 1.0 - warWeariness * 0.5;
						if (u.victoryBoostTicks > 0) pushReadiness *= 1.4;
					} else {
						pushReadiness = 0.7 * (1.0 - warWeariness);
					}

					if (countryObj && !countryObj.isSaturated) {
						pushReadiness = 0.3;
					}
				}

				let moveDist =
					baseSpeed *
					speedMult *
					planSpeedMult *
					neutralPenalty *
					retreatBoost *
					pushReadiness *
					0.8; // Reduced movement speed

				// Safety: Prevent NaN from propagating if moveDir calculation fails
				if (
					!Number.isNaN(moveDirLat) &&
					!Number.isNaN(moveDirLng) &&
					!Number.isNaN(moveDist)
				) {
					// Naval block: non-transport units cannot enter water tiles
					if (!u.isTransport) {
						const newLat = u.lat + moveDirLat * moveDist;
						const newLng = u.lng + moveDirLng * moveDist;
						const destIdx = getGridIndex(newLat, newLng);
						if (destIdx !== -1 && landMask[destIdx] === 0) {
							if (!isAtSea) {
								// Would enter water — try coast deflection before stopping
								let deflected = false;
								const lookDist = moveDist * 3;
								for (const ang of [-90, 90, -45, 45, -135, 135, -30, 30]) {
									const rad = (ang * Math.PI) / 180;
									const candLat =
										moveDirLat * Math.cos(rad) - moveDirLng * Math.sin(rad);
									const candLng =
										moveDirLat * Math.sin(rad) + moveDirLng * Math.cos(rad);
									let landCount = 0;
									for (let s = 1; s <= 3; s++) {
										const ci = getGridIndex(
											u.lat + candLat * lookDist * s,
											u.lng + candLng * lookDist * s,
										);
										if (ci !== -1 && landMask[ci] > 0) landCount++;
									}
									if (landCount >= 2) {
										const mag = Math.sqrt(
											candLat * candLat + candLng * candLng,
										);
										if (mag > 0) {
											moveDirLat = candLat / mag;
											moveDirLng = candLng / mag;
										}
										deflected = true;
										break;
									}
								}
								if (!deflected) {
									moveDirLat = 0;
									moveDirLng = 0;
									moveDist = 0;
								}
							}
						}
					}

					u.lat += moveDirLat * moveDist;
					u.lng += moveDirLng * moveDist;
					u.dirLat = moveDirLat; // Store trajectory for renderer
					u.dirLng = moveDirLng;

					// Geographic clamping/wrapping to prevent units from flying off the map
					u.lat = Math.max(-89.9, Math.min(89.9, u.lat));
					// Wrap longitude [-180, 180]
					if (u.lng > 180) u.lng -= 360;
					if (u.lng < -180) u.lng += 360;
				}
			} else if (target && typeof target.health !== "undefined") {
				// Combat logic
				u.lastCombatTick = simFrameCount;
				target.lastCombatTick = simFrameCount;

				// Strategic Depth: Units defending their own de jure (historical) territory get a defense boost.
				let defenseBonus = 1.0;
				const currentIdx = gridIdxNow;
				const isDeJureLand =
					currentIdx !== -1 && deJureMap[currentIdx] === u.sovereignId;

				if (!isAtSea) {
					if (isDeJureLand) defenseBonus *= 0.65; // 35% reduction in historical land
					if (
						worldControlMap[gridIdxNow] === u.sovereignId &&
						Math.abs(currentControl) < 0.2
					) {
						defenseBonus *= 0.85; // Additional stack for unoccupied frontline
					}

					// City Fortification: Units near friendly cities are much harder to destroy
					const nearbyCity = activeTheaterCities.find(
						(c) =>
							c.sovereignId === u.sovereignId &&
							(u.lat - c.lat) ** 2 + (u.lng - c.lng) ** 2 < 0.04,
					);
					if (nearbyCity) {
						defenseBonus *= 0.45; // Significant defense boost in urban centers
					}
				}

				// War of Attrition: In long wars, units defending "dig in", taking less damage
				// but making it harder for the attacker to break through without high losses.
				const longWarDefense = simFrameCount > 6000 ? 0.75 : 1.0;

				const tDmg = CONFIG.COMBAT_DAMAGE * damageDealtMult * 0.7;
				const uDmg =
					CONFIG.COMBAT_DAMAGE *
					0.8 *
					damageTakenMult *
					defenseBonus *
					longWarDefense;

				// Casualties increase while battling (direct engagement)
				recordDamage(target, tDmg, u);
				recordDamage(u, uDmg, target);

				// Positional knockback: both units are pushed by the force of the engagement.
				// Direction is along the line between them; distance is small and scaled by relative damage.
				const dLat = target.lat - u.lat;
				let dLng = target.lng - u.lng;
				if (dLng > 180) dLng -= 360;
				else if (dLng < -180) dLng += 360;
				const distSq = dLat * dLat + dLng * dLng;
				if (distSq > 0) {
					const dist = Math.sqrt(distSq) || 1e-6;
					const nx = dLng / dist;
					const ny = dLat / dist;

					// Base push scaled by movement speed so it feels consistent with unit motion
					const basePush =
						(isAtSea ? CONFIG.UNIT_NAVAL_SPEED : CONFIG.UNIT_SPEED) * 1.2;
					// Relative damage factor: more damage dealt -> stronger push on the target
					const totalDmg = tDmg + uDmg || 1e-6;
					const targetFactor = Math.min(1.5, (tDmg / totalDmg) * 1.5);
					const selfFactor = Math.min(1.0, (uDmg / totalDmg) * 1.0);

					// Push target away from attacker
					const targetPushLat = ny * basePush * targetFactor;
					const targetPushLng = nx * basePush * targetFactor;
					// Push attacker slightly backwards as recoil
					const selfPushLat = -ny * basePush * 0.5 * selfFactor;
					const selfPushLng = -nx * basePush * 0.5 * selfFactor;

					// Apply knockback, keeping within latitude limits and wrapping longitude
					const applyPush = (unitObj, dLatMove, dLngMove) => {
						let newLat = unitObj.lat + dLatMove;
						let newLng = unitObj.lng + dLngMove;
						newLat = Math.max(-89.9, Math.min(89.9, newLat));
						if (newLng > 180) newLng -= 360;
						else if (newLng < -180) newLng += 360;
						unitObj.lat = newLat;
						unitObj.lng = newLng;
					};

					if (
						Number.isFinite(targetPushLat) &&
						Number.isFinite(targetPushLng)
					) {
						applyPush(target, targetPushLat, targetPushLng);
					}
					if (Number.isFinite(selfPushLat) && Number.isFinite(selfPushLng)) {
						applyPush(u, selfPushLat, selfPushLng);
					}
				}

				if (target.health <= 0) {
					u.victoryBoostTicks = 180; // Reduced momentum duration
				}
			}
		} else {
		}

		if (u.health <= 0) {
			// Units are already being counted for casualties per-hit during simulation.
			// This just cleans them up when they reach 0 health.
			units.splice(i, 1);
		}
	}

	// NOTE: even if sideSoldiers reach 0, sides remain on the field and can still recruit.
	// This keeps wars from hard-locking when a side's manpower bar is exhausted.

	window.__perf.unitLoop += performance.now() - _t3;
	const _t4 = performance.now();
	// 4. Individual Capitulation & Treaty Logic
	const timeSinceTreaty = Date.now() - lastTreatyTime;

	for (let sIdx = 0; sIdx < MAX_SIDES; sIdx++) {
		if (initialSideSoldiers[sIdx] > 0) {
			sideCasualties[sIdx] = Math.max(
				0,
				initialSideSoldiers[sIdx] - sideSoldiers[sIdx],
			);
		}
	}

	// Check for individual country falls
	for (let sIdx = 0; sIdx < sides.length; sIdx++) {
		const side = sides[sIdx];
		for (let i = side.length - 1; i >= 0; i--) {
			const country = side[i];

			// Decrement grace period
			if (country.graceTicks > 0) country.graceTicks--;

			const stats = countryStats.get(country.id);
			if (!stats) continue;

			const initial = country.initialCells || 1;

			// On non-counting frames, owned/controlled may be cached. For unitless
			// countries, do a direct ownership pass to avoid stale values blocking annexation.
			let liveOwnedWarTiles = stats.owned || 0;
			if (stats.units === 0) {
				let exactOwned = 0;
				for (let idx = 0; idx < worldControlMap.length; idx++) {
					if (landMask[idx] === 2 && worldControlMap[idx] === country.id)
						exactOwned++;
				}
				liveOwnedWarTiles = exactOwned;
			}

			// Individual Capitulation criteria:
			// - If undefended (0 units), capitulate earlier (25% land).
			// - Otherwise, fight until almost nothing remains (2% land).
			// - Hard fail-safe: if a country owns zero active war tiles, annex immediately.
			//   This prevents "ghost" survivors from dragging wars on after total loss.
			// - For unitless countries, direct-scan dominantSideMap to bypass stale
			//   influence/cached values that can keep controlPct artificially high.
			const isProtected = country.graceTicks > 0;
			let directControlled = stats.controlled;
			if (stats.units === 0) {
				directControlled = 0;
				const scanSIdx = countryToSideMap.get(country.id);
				for (let di = 0; di < worldControlMap.length; di++) {
					if (
						landMask[di] === 2 &&
						worldControlMap[di] === country.id &&
						dominantSideMap[di] === scanSIdx
					) {
						directControlled++;
					}
				}
			}
			const controlPct = (directControlled / (country.initialCells || 1)) * 100;
			const hasNoOwnedWarTiles = liveOwnedWarTiles <= 0;
			const nearlyErasedNoUnits =
				stats.units === 0 &&
				liveOwnedWarTiles <= Math.max(1, Math.floor(initial * 0.003));
			const heldCities = countryToCityCount.get(country.id) || 0;
			const noForcesNoCities = stats.units === 0 && heldCities === 0;
			if (
				!isProtected &&
				(hasNoOwnedWarTiles ||
					nearlyErasedNoUnits ||
					noForcesNoCities ||
					(stats.units === 0 && controlPct < 25) ||
					controlPct < 2)
			) {
				capitulateCountry(country, sIdx);
				// Exit tick early to re-evaluate state in next tick with updated sides/units
				return false;
			}
		}
	}

	// Determine which "poles" still have participating and combat-effective (OFFENSE) countries
	const activeSideSet = new Set();
	const effectiveSideSet = new Set();
	sides.forEach((side, idx) => {
		if (side.length > 0) {
			activeSideSet.add(idx);
			if (side.some((c) => c.role === "OFFENSE")) {
				effectiveSideSet.add(idx);
			}
		}
	});

	if (gameState === "SIMULATING") {
		if (activeSideSet.size <= 1) {
			const winnerIdx = Array.from(activeSideSet)[0] || 0;
			applyTreaty("FULL_CAPITULATION", winnerIdx);
			return true;
		}

		if (effectiveSideSet.size <= 1 && activeSideSet.size > 1) {
			const winnerIdx = Array.from(effectiveSideSet)[0] || 0;
			applyTreaty("FULL_CAPITULATION", winnerIdx);
			return true;
		}
	}

	let sideTerritoryCounts = _cachedSideTerritoryCounts;
	if (shouldCountLand) {
		const counts = new Array(sides.length).fill(0);
		for (let i = 0; i < dominantSideMap.length; i++) {
			if (landMask[i] === 2) {
				const ds = dominantSideMap[i];
				if (ds >= 0 && ds < sides.length) counts[ds]++;
			}
		}
		_cachedSideTerritoryCounts = counts;
		sideTerritoryCounts = counts;
		const total = counts.reduce((a, b) => a + b, 0);
		const pcts = new Array(sides.length).fill(50);
		if (total > 0) {
			for (let si = 0; si < sides.length; si++) {
				pcts[si] = Math.round((counts[si] / total) * 100);
			}
		}
		_cachedSideTerritoryPcts = pcts;
	}
	const totalTerritory = sideTerritoryCounts.reduce((a, b) => a + b, 0);
	const side0Pct =
		totalTerritory > 0 ? (sideTerritoryCounts[0] / totalTerritory) * 100 : 50;

	if (side0Pct >= 99.9) {
		applyTreaty("FULL_CAPITULATION", 0);
		return true;
	} else if (side0Pct <= 0.1) {
		applyTreaty("FULL_CAPITULATION", sides.length > 1 ? 1 : 0);
		return true;
	} else if (timeSinceTreaty > 6000 && treatyAlert.style.display === "none") {
		if (!peaceTreatiesDisabled) {
			const getSidePressure = (sIdx) => {
				let total = 0;
				let count = 0;
				const side = sides[sIdx];
				if (!side) return 0;
				side.forEach((c) => {
					total += aiCountryState.get(c.id)?.peacePressure || 0;
					count++;
				});
				return count > 0 ? total / count : 0;
			};
			const pressures = sides.map((_, idx) => getSidePressure(idx));
			const maxPressure = Math.max(...pressures.filter((p) => p > 0));
			const proposalChance =
				AI_DESPERATION.PEACE_PRESSURE_PROPOSAL_BASE *
				(1 +
					Math.min(
						AI_DESPERATION.PEACE_PRESSURE_PROPOSAL_MULT_MAX,
						maxPressure * 5,
					));

			if (Math.random() < proposalChance) {
				const proposerSideIdx = Math.floor(Math.random() * sides.length);
				if (sides[proposerSideIdx] && sides[proposerSideIdx].length > 0) {
					const receiverSideIdx = sides.findIndex(
						(s, i) => i !== proposerSideIdx && s.length > 0,
					);
					if (receiverSideIdx !== -1) {
						const receiverLand =
							totalTerritory > 0
								? (sideTerritoryCounts[receiverSideIdx] / totalTerritory) * 100
								: 50;
						const proposerPressure = pressures[proposerSideIdx];
						const receiverPressure = pressures[receiverSideIdx];
						let acceptChance = Math.max(0.1, (100 - receiverLand) / 100);
						acceptChance += receiverPressure * 0.25;
						acceptChance -=
							Math.max(0, proposerPressure - receiverPressure) * 0.12;
						acceptChance = Math.max(0.05, Math.min(0.95, acceptChance));
						showTreatyOffer(
							proposerSideIdx,
							Math.random() < acceptChance,
							proposerSideIdx,
						);
					}
				}
			}
		}
	}

	// Rebellion victory check
	if (activeRebellion && simFrameCount % 15 === 0) {
		const { rebelId, startTime } = activeRebellion;

		// Goliath Buff Decay: Rebels lose their initial combat bonus after ~20 seconds at 1x speed
		if (simFrameCount - startTime > 1200) {
			sides
				.flat()
				.filter(Boolean)
				.forEach((c) => {
					if (c.id === rebelId && c.buffState === "buff") {
						c.buffState = "none";
						statusText.innerText = `${c.name.toUpperCase()} REVOLUTIONARY FERVOR SUBSIDING`;
					}
				});
			const meta = countryMetadata.find((m) => m && m.id === rebelId);
			if (meta && meta.buffState === "buff") meta.buffState = "none";
		}

		let rebelDeJureCount = 0;
		let rebelReclaimedCount = 0;

		// Check if rebel has reclaimed its original borders
		// Use a much higher density scan for this to ensure small countries (like Portugal) hit the trigger reliably.
		// When many sides are active, we can safely sample more sparsely.
		const optimizationFactor = getOptimizationFactor();
		const winCheckStep = Math.max(
			1,
			Math.floor((deJureMap.length / 100000) * optimizationFactor),
		);
		const rebelSide = sides.find((s) => s.some((c) => c.id === rebelId));
		const rebelSideIdx = rebelSide ? sides.indexOf(rebelSide) : -1;

		for (let i = 0; i < deJureMap.length; i += winCheckStep) {
			if (deJureMap[i] === rebelId) {
				rebelDeJureCount++;
				const isOccupiedByRebel =
					worldControlMap[i] === rebelId || dominantSideMap[i] === rebelSideIdx;
				if (isOccupiedByRebel) {
					rebelReclaimedCount++;
				}
			}
		}

		// Robust threshold (85%) and high scan density to ensure peace triggers even with scattered islands/tiny pockets
		if (rebelDeJureCount > 0 && rebelReclaimedCount > rebelDeJureCount * 0.85) {
			handleRebellionPeace();
			return true;
		}
	}

	if (units.length === 0 && gameState === "SIMULATING") {
		applyTreaty("WHITE_PEACE");
		return true;
	}

	// 5. Update Bombs & Explosions
	if (bombsDisabled) {
		bombs = [];
	}
	for (let i = bombs.length - 1; i >= 0; i--) {
		const b = bombs[i];
		// Slower step for smoother movement, accelerating slightly on descent
		const step =
			0.0055 * (b.state === "falling" ? 1 + (b.progress - 0.5) * 2.5 : 1);
		b.progress += step;

		if (b.state === "rising" && b.progress >= 0.5) {
			b.state = "falling";
		}

		const t = b.progress;
		const latBase = b.startLat + (b.targetLat - b.startLat) * t;
		const lngBase = b.startLng + (b.targetLng - b.startLng) * t;

		const alt = Math.sin(Math.PI * t) * b.peakAlt;
		b.currentLat = latBase + alt;
		b.currentLng = lngBase;

		// Predict next position for rotation calculation
		const nextT = Math.min(1.0, t + 0.005);
		const nextLatBase = b.startLat + (b.targetLat - b.startLat) * nextT;
		const nextLngBase = b.startLng + (b.targetLng - b.startLng) * nextT;
		const nextAlt = Math.sin(Math.PI * nextT) * b.peakAlt;
		b.nextLat = nextLatBase + nextAlt;
		b.nextLng = nextLngBase;

		// Trail logic
		b.trail.push({ lat: b.currentLat, lng: b.currentLng });
		if (b.trail.length > 40) b.trail.shift();

		if (b.progress >= 1.0) {
			// Impact!
			playExplosionSound();
			explosions.push({
				lat: b.targetLat,
				lng: b.targetLng,
				life: 30,
				maxRadius: 20,
			});

			// Damage units in radius instead of instantly killing them
			const killRadiusSq = 0.5 * 0.5;
			const killRadius = Math.sqrt(killRadiusSq);
			for (let j = 0; j < units.length; j++) {
				const victim = units[j];
				const dSq =
					(victim.lat - b.targetLat) ** 2 + (victim.lng - b.targetLng) ** 2;
				if (dSq < killRadiusSq) {
					const dist = Math.sqrt(dSq);
					const falloff = 1 - dist / killRadius; // 1 at center, 0 at edge
					// Base missile damage scaled by distance; strong but non‑lethal except near center
					const baseDamage = CONFIG.COMBAT_DAMAGE * 4;
					const damage = baseDamage * Math.max(0.2, falloff); // ensure a minimum chunk
					recordDamage(victim, damage);
					// Do NOT splice here; units will be removed later when their health <= 0
				}
			}
			bombs.splice(i, 1);
		}
	}

	// AI Bomb Launching (Restored and buffed frequency)
	const simYear = gameTimeDate ? gameTimeDate.year : 2024;
	// Enforce 1942 technology gate for missiles/bombs
	const canFireMissiles = !gameTimeEnabled || simYear >= 1942;

	if (!bombsDisabled && canFireMissiles) {
		const activeSideList = sides
			.map((s, idx) => ({ s, idx }))
			.filter((x) => x.s.length > 0);

		if (activeSideList.length >= 2) {
			if (bases.length > 0 && Math.random() < 0.01) {
				const launcherEntry =
					activeSideList[Math.floor(Math.random() * activeSideList.length)];
				const launcherSideIdx = launcherEntry.idx;
				const enemyEntries = activeSideList.filter(
					(x) => x.idx !== launcherSideIdx,
				);
				if (enemyEntries.length > 0) {
					const targetEntry =
						enemyEntries[Math.floor(Math.random() * enemyEntries.length)];
					const targetSideIdx = targetEntry.idx;
					const myBases = bases.filter((b) => b.sideIndex === launcherSideIdx);
					const enemyUnits = _tickUnitsBySide[targetSideIdx] || [];
					if (myBases.length > 0 && enemyUnits.length > 0) {
						const launcher =
							myBases[Math.floor(Math.random() * myBases.length)];
						const target =
							enemyUnits[Math.floor(Math.random() * enemyUnits.length)];
						launchBomb(
							launcher.lat,
							launcher.lng,
							target.lat,
							target.lng,
							launcherSideIdx,
						);
					}
				}
			}
		}
	}

	for (let i = explosions.length - 1; i >= 0; i--) {
		explosions[i].life--;
		if (explosions[i].life <= 0) explosions.splice(i, 1);
	}

	// Cache unit counts / soldier estimates once per tick instead of re-scanning
	// the full units[] array every visual frame in updateLoop().
	const numSides = sides.length;
	const unitCounts = new Array(numSides).fill(0);
	const soldierEsts = new Array(numSides).fill(0);
	for (let i = 0; i < units.length; i++) {
		const u = units[i];
		const si = u.sideIndex;
		if (si >= 0 && si < numSides) {
			unitCounts[si]++;
			const sp = soldiersPerUnit[si] || CONFIG.UNIT_TO_SOLDIER_RATIO;
			soldierEsts[si] += (u.health / CONFIG.UNIT_HEALTH) * sp;
		}
	}
	_cachedSideUnitCounts = unitCounts;
	_cachedSideSoldierEsts = soldierEsts;

	window.__perf.post += performance.now() - _t4;
	return false;
}

export function updateLoop(now) {
	const shouldSimulate =
		gameState === "SIMULATING" ||
		(godModeActive &&
			(preGodModeState === "SIMULATING" || preGodModeState === "WAR_OVER"));
	if (!shouldSimulate) {
		return;
	}
	// Avoid running the visual loop while a background tick loop is active
	if (document.hidden) return;

	// --- Performance measurement ---
	const realNow = performance.now();
	if (_perfLastTime > 0) {
		const dt = realNow - _perfLastTime;
		if (_isBenchmarking) _perfSamples.push(dt);
		_perfFrameTimeSum += dt;
		_perfFrameCount++;
		if (_perfFrameCount >= 30) {
			const avgMs = _perfFrameTimeSum / _perfFrameCount;
			const fps = 1000 / avgMs;
			let text = `FPS: ${fps.toFixed(0)} | Frame: ${avgMs.toFixed(1)}ms`;
			if (_isBenchmarking) {
				const remaining = Math.max(
					0,
					Math.ceil((_perfBenchmarkEnd - realNow) / 1000),
				);
				text += ` | Remaining Sim Time: ${remaining}s`;
			}
			perfOverlay.textContent = text;
			_perfFrameTimeSum = 0;
			_perfFrameCount = 0;
		}
	}
	_perfLastTime = realNow;

	// End-of-benchmark check: auto-pause at 60s mark
	if (_isBenchmarking && realNow >= _perfBenchmarkEnd) {
		_isBenchmarking = false;
		isPaused = true;
		if (perfOverlay) perfOverlay.style.display = "none";
		showBenchmarkResults();
	}
	// --- End performance measurement ---

	if (!isPaused) {
		// Run sub-ticks based on simSpeed (handles both fast-forward and slow-motion)
		frameAccumulator += simSpeed;
		while (frameAccumulator >= 1) {
			const warEnded = performSimulationTick();
			if (warEnded) {
				frameAccumulator = 0;
				return;
			}
			frameAccumulator -= 1;
		}

		// Advance in-game date by real time
		if (typeof now === "number") {
			// Because we don't track previous timestamp, approximate per-frame using 16ms if undefined
			tickGameTime(16.67);
		}
	}

	// Advance simulation frame counter once per visual loop
	simFrameCount++;

	// Aggressive Render Skipping: At high sim speeds, process mechanics multiple times without painting
	let skipRenderThisFrame = false;
	if (simSpeed >= 5) {
		skipRenderThisFrame = simFrameCount % 5 !== 0;
	} else if (simSpeed >= 3) {
		skipRenderThisFrame = simFrameCount % 3 !== 0;
	} else if (simSpeed >= 2) {
		skipRenderThisFrame = simFrameCount % 2 !== 0;
	}

	if (skipRenderThisFrame && document.hidden === false) {
		animationFrameId = requestAnimationFrame(updateLoop);
		return;
	}

	const sideUnitCounts = _cachedSideUnitCounts;
	const sideSoldierEsts = _cachedSideSoldierEsts;

	for (let si = 0; si < sides.length; si++) {
		const el = _cachedSoldierEls[si];
		if (el)
			el.textContent = influenceLayer.formatSoldiers(
				sideSoldierEsts[si] > 0 && sideSoldierEsts[si] < 1
					? 1
					: sideSoldierEsts[si],
			);
	}

	if (_cachedUnitCountSpans.length) {
		for (let si = 0; si < _cachedUnitCountSpans.length; si++) {
			_cachedUnitCountSpans[si].textContent = sideUnitCounts[si];
		}
	}

	const sideCityCounts = new Array(sides.length).fill(0);
	activeTheaterCities.forEach((c) => {
		const dm = dominantSideMap[getGridIndex(c.lat, c.lng)];
		if (dm >= 0 && dm < sides.length) sideCityCounts[dm]++;
	});
	for (let si = 0; si < sides.length; si++) {
		const el = _cachedCityEls[si];
		if (el) el.textContent = sideCityCounts[si];
	}

	// Throttled UI rendering in Flag mode to maintain responsive interaction and framerate
	simFrameCount++;

	// Throttled Combatants UI update
	if (simFrameCount % 30 === 0) {
		updateCombatantsUI();
	}

	// Update Casualty UI (Every 5 frames for "live" counting effect)
	const casualtyContainer = document.getElementById("casualty-lists-container");
	if (casualtyContainer && simFrameCount % 5 === 0) {
		let entriesKey = "";
		const entriesFlat = [];
		for (let sIdx = 0; sIdx < sides.length; sIdx++) {
			if (!sides[sIdx] || sides[sIdx].length === 0) continue;
			const entries = initialCombatants.filter((c) => c.sideIndex === sIdx);
			sides[sIdx].forEach((c) => {
				if (!entries.some((e) => e.id === c.id)) {
					entries.push({ id: c.id, name: c.name, sideIndex: sIdx });
				}
			});
			if (entries.length === 0) continue;
			for (const e of entries) {
				entriesFlat.push({ ...e, side: sIdx });
				entriesKey += `${e.id},`;
			}
		}
		const structureChanged = entriesKey !== _casualtyStructureKey;
		if (structureChanged) {
			_casualtyStructureKey = entriesKey;
			let html = "";
			let currentSide = -1;
			let sidePos = 0;
			for (const e of entriesFlat) {
				const casualties = countryCasualties.get(e.id) || 0;
				const formatted = influenceLayer.formatSoldiers(casualties);
				const isDefeated = !sides.flat().some((active) => active.id === e.id);
				if (e.side !== currentSide) {
					if (currentSide !== -1) html += `</div>`;
					currentSide = e.side;
					sidePos = 0;
					html += `<div class="casualty-side-list">`;
				}
				const isPrimary = sidePos === 0 && !isDefeated;
				const sideColor = sideColors[currentSide].replace(rgbaRe, "1)");
				const meta = countryMetadata[e.id - 1];
				let flagSrc = meta?.flagUrl || "";
				if (meta?.tempFlag instanceof HTMLCanvasElement) {
					try {
						flagSrc = meta.tempFlag.toDataURL();
					} catch (_e) {}
				}
				html += `<div class="casualty-item ${isPrimary ? "primary" : "secondary"}" style="opacity: ${isDefeated ? 0.45 : 1};" data-ctype="cas-item" data-cid="${e.id}">
                    <img src="${flagSrc}" class="cas-flag ${isPrimary ? "" : "small"}" alt="" loading="lazy" decoding="async" style="${isDefeated ? "filter: grayscale(1);" : ""}">
                    <div class="cas-value" data-cval="${e.id}" style="font-size: ${isPrimary ? "18px" : "12px"}; color: ${sideColor};">${formatted}</div>
                </div>`;
				sidePos++;
			}
			if (currentSide !== -1) html += `</div>`;
			casualtyContainer.innerHTML = html;
			_casualtyValueEls = {};
			casualtyContainer.querySelectorAll("[data-cval]").forEach((el) => {
				_casualtyValueEls[el.getAttribute("data-cval")] = el;
			});
		} else {
			for (const e of entriesFlat) {
				const el = _casualtyValueEls[e.id];
				if (el) {
					const casualties = countryCasualties.get(e.id) || 0;
					el.textContent = influenceLayer.formatSoldiers(casualties);
				}
			}
		}
	}

	if (viewMode === "FLAG") {
		// In flag view, force the canvas layer to fully update each frame so units and borders
		// keep animating even when the camera is stationary.
		influenceLayer._forceRender = true;
		influenceLayer._update();
	} else {
		influenceLayer.render();
	}

	// Show/hide performance overlay only during benchmark runs
	if (perfOverlay) {
		perfOverlay.style.display = _isBenchmarking ? "block" : "none";
	}

	animationFrameId = requestAnimationFrame(updateLoop);
}

export function updateCombatantsUI() {
	// Combatants list removed from stats panel to reduce clutter.
	// Users can click nations directly on the map to buff them via the inspector.
}

/**
 * Build and show global leaderboard of all countries with current size and estimated unit strength.
 */
export function openLeaderboard() {
	if (
		!leaderboardOverlay ||
		!leaderboardList ||
		!countryMetadata ||
		!worldControlMap
	)
		return;

	// Count tiles per country id
	const maxId = countryMetadata.reduce(
		(max, m) => (m ? Math.max(max, m.id) : max),
		0,
	);
	const tileCounts = new Int32Array(maxId + 1);
	for (let i = 0; i < worldControlMap.length; i++) {
		const id = worldControlMap[i];
		if (id > 0 && id <= maxId) tileCounts[id]++;
	}

	const lang = getCookie("mw_lang") || "en";

	const rows = [];
	for (let i = 0; i < countryMetadata.length; i++) {
		const meta = countryMetadata[i];
		if (!meta) continue;
		const id = meta.id;
		const tiles = tileCounts[id] || 0;

		// Exclude Antarctica from the leaderboard to avoid it dominating due to map area
		const rawName = meta.name || "Unknown";
		if (rawName === "Antarctica") continue;

		// Size zero: still show (releasables / dead states), but mark as 0 tiles
		const estUnits = estimateUnitsForCountry ? estimateUnitsForCountry(id) : 0;

		const displayName = getTranslation(rawName, lang, "NATIONS");
		const flagUrl = meta.tempFlag?.src
			? meta.tempFlag.src
			: meta.flagUrl || getFlagUrl(findCodeByName(meta.name), meta.name);
		rows.push({
			id,
			name: displayName,
			rawName,
			tiles,
			estUnits,
			flagUrl,
		});
	}

	// Primary sort: estimated units desc, secondary: tiles desc, tertiary: name
	rows.sort((a, b) => {
		if (b.estUnits !== a.estUnits) return b.estUnits - a.estUnits;
		if (b.tiles !== a.tiles) return b.tiles - a.tiles;
		return a.name.localeCompare(b.name);
	});

	leaderboardList.innerHTML = rows
		.map((row, idx) => {
			const unitsLabel =
				row.estUnits > 0 ? influenceLayer.formatSoldiers(row.estUnits) : "—";
			const tilesLabel = row.tiles.toLocaleString();
			const rank = idx + 1;
			const flagSrc = row.flagUrl || "";
			return `
            <div class="scroller-card" style="padding: 10px; display: flex; align-items: center; gap: 10px;">
                <div class="leaderboard-rank" style="width: 30px; font-family: 'Playfair Display'; font-size: 18px;">${rank}</div>
                ${flagSrc ? `<img src="${flagSrc}" class="leaderboard-flag" style="width: 35px; height: 22px;">` : `<div class="leaderboard-flag" style="width: 35px; height: 22px; background:#111;"></div>`}
                <div class="scroller-card-name" style="flex: 2; font-size: 16px; margin: 0;">${row.name}</div>
                <div class="leaderboard-tiles" style="flex: 1; text-align: right; color: #888; font-size: 12px;">${tilesLabel}</div>
                <div class="leaderboard-units" style="flex: 1; text-align: right; font-weight: bold; font-size: 13px;">${unitsLabel}</div>
            </div>
        `;
		})
		.join("");

	leaderboardOverlay.style.display = "flex";
}

export function showTreatyOffer(proposerSideIdx, willAccept) {
	lastTreatyTime = Date.now();
	let name;
	if (sides[proposerSideIdx]?.[0]) {
		const side = sides[proposerSideIdx];
		name = side.length > 1 ? `${side[0].name} Allies` : side[0].name;
	} else {
		const nameEl = document.querySelector(
			`[data-sidename="${proposerSideIdx}"]`,
		);
		name = nameEl
			? nameEl.innerText
			: `Side ${String.fromCharCode(65 + proposerSideIdx)}`;
	}

	treatyMsg.innerText = `${name} requests peace`;
	treatyAlert.style.display = "block";
	document.getElementById("treaty-status").innerText =
		"Considering proposal...";

	setTimeout(() => {
		if (willAccept) {
			document.getElementById("treaty-status").innerText = "Treaty Accepted";
			setTimeout(() => applyTreaty("PEACE_TREATY"), 1500);
		} else {
			document.getElementById("treaty-status").innerText = "Proposal Rejected";
			setTimeout(() => {
				treatyAlert.style.display = "none";
				lastTreatyTime = Date.now();
			}, 1500);
		}
	}, 2000);
}

export function capitulateCountry(country, sideIndex) {
	const side = sides[sideIndex];
	if (!side) return;

	// Announce the individual fall
	statusText.innerText = `${country.name} HAS CAPITULATED`;
	treatyMsg.innerText = "NATION ANNEXED";
	document.getElementById("treaty-status").innerText =
		`${country.name} territory has been seized.`;
	treatyAlert.style.display = "block";

	// Auto-hide the alert after a delay if war is still going
	setTimeout(() => {
		if (gameState === "SIMULATING") {
			treatyAlert.style.display = "none";
		}
	}, 4000);

	// Build owner -> side index map once for this operation
	const ownerToSideMap = new Map();
	sides.forEach((s, idx) => {
		s.forEach((c) => {
			ownerToSideMap.set(c.id, idx);
		});
	});

	// Snapshot all tiles currently owned by the capitulating country so it can be released later
	const victimTerritorySnapshot = [];
	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === country.id) {
			const y = Math.floor(i / gridWidth);
			const x = i % gridWidth;
			victimTerritorySnapshot.push([x, y]);
		}
	}

	// Compute casualty-proportional territory split
	// Find all attackers that dealt >25% of total casualties to this country
	const attackerMap = casualtyByAttacker.get(country.id) || new Map();
	let totalCasToVictim = 0;
	attackerMap.forEach((loss) => {
		totalCasToVictim += loss;
	});

	// Build set of active combatant IDs (countries still in the war)
	const activeCombatantIds = new Set();
	for (let si = 0; si < sides.length; si++) {
		const s = sides[si];
		for (let ci = 0; ci < s.length; ci++) {
			activeCombatantIds.add(s[ci].id);
		}
	}

	// Build list of qualifying attackers: { sovereignId, loss, share }
	// Only include attackers that are still active combatants
	const qualifyingAttackers = [];
	if (totalCasToVictim > 0) {
		attackerMap.forEach((loss, attackerId) => {
			if (!activeCombatantIds.has(attackerId)) return;
			const share = loss / totalCasToVictim;
			if (share >= 0.25) {
				qualifyingAttackers.push({ sovereignId: attackerId, loss, share });
			}
		});
		qualifyingAttackers.sort((a, b) => b.loss - a.loss);
	}

	// Fallback: if no qualifying attackers (attrition-only death), use any side with units nearby
	let fallbackWinnerId = 0;
	if (qualifyingAttackers.length === 0) {
		for (let j = 0; j < sides.length; j++) {
			if (j !== sideIndex && sides[j].length > 0) {
				fallbackWinnerId = sides[j][0].id;
				qualifyingAttackers.push({
					sovereignId: fallbackWinnerId,
					loss: 1,
					share: 1.0,
				});
				break;
			}
		}
	}

	// Pre-compute centroid of each qualifying attacker's current territory for proximity assignment
	const attackerCentroids = new Map();
	qualifyingAttackers.forEach((qa) => {
		let sumLat = 0,
			sumLng = 0,
			count = 0;
		for (let i = 0; i < worldControlMap.length; i++) {
			if (worldControlMap[i] === qa.sovereignId) {
				const y = Math.floor(i / gridWidth);
				const x = i % gridWidth;
				sumLat += y * CONFIG.GRID_RES - 90;
				sumLng += x * CONFIG.GRID_RES - 180;
				count++;
			}
		}
		attackerCentroids.set(
			qa.sovereignId,
			count > 0
				? { lat: sumLat / count, lng: sumLng / count }
				: { lat: 0, lng: 0 },
		);
	});

	// Assign each unoccupied tile to the nearest qualifying attacker, weighted by casualty share
	const affectedIndices = [];
	const attackerTileCounts = new Map();
	for (let qi = 0; qi < qualifyingAttackers.length; qi++) {
		attackerTileCounts.set(qualifyingAttackers[qi].sovereignId, 0);
	}

	// Compute proportional tile quotas
	const totalUnoccupied = (() => {
		let n = 0;
		for (let i = 0; i < worldControlMap.length; i++) {
			if (worldControlMap[i] === country.id && landMask[i] > 0) n++;
		}
		return n;
	})();
	const attackerQuotas = new Map();
	qualifyingAttackers.forEach((qa) => {
		attackerQuotas.set(
			qa.sovereignId,
			Math.max(1, Math.round(qa.share * totalUnoccupied)),
		);
	});

	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === country.id && landMask[i] > 0) {
			const occupierId = primaryOccupierMap[i];

			// Check if already physically occupied by an enemy
			let occupierOnOpposingSide = false;
			sides.forEach((s, idx) => {
				if (idx !== sideIndex && s.some((c) => c.id === occupierId)) {
					occupierOnOpposingSide = true;
				}
			});

			if (occupierOnOpposingSide) {
				// Tile already occupied — keep the occupier
				worldControlMap[i] = occupierId;
				primaryOccupierMap[i] = occupierId;
			} else {
				// Unoccupied tile — assign to nearest qualifying attacker respecting quotas
				const y = Math.floor(i / gridWidth);
				const x = i % gridWidth;
				const tileLat = y * CONFIG.GRID_RES - 90;
				const tileLng = x * CONFIG.GRID_RES - 180;

				let bestAttacker = qualifyingAttackers[0].sovereignId;
				let bestDist = Infinity;
				for (const qa of qualifyingAttackers) {
					const c = attackerCentroids.get(qa.sovereignId);
					const dSq = (tileLat - c.lat) ** 2 + (tileLng - c.lng) ** 2;
					const quota = attackerQuotas.get(qa.sovereignId) || 0;
					const used = attackerTileCounts.get(qa.sovereignId) || 0;
					if (used >= quota) continue;
					if (dSq < bestDist) {
						bestDist = dSq;
						bestAttacker = qa.sovereignId;
					}
				}
				worldControlMap[i] = bestAttacker;
				primaryOccupierMap[i] = bestAttacker;
				attackerTileCounts.set(
					bestAttacker,
					(attackerTileCounts.get(bestAttacker) || 0) + 1,
				);
			}
			affectedIndices.push(i);
		}
	}

	// Determine primary annexer (highest casualty contributor) for releasable transfer
	const primaryAnnexerId =
		qualifyingAttackers.length > 0
			? qualifyingAttackers[0].sovereignId
			: fallbackWinnerId;

	// Re-evaluate warzone status for newly annexed tiles so winners can keep pushing
	affectedIndices.forEach((idx) => {
		const ownerId = worldControlMap[idx];
		if (ownerId <= 0) {
			landMask[idx] = 1;
			for (let s = 0; s < sideInfluenceMaps.length; s++)
				sideInfluenceMaps[s][idx] = 0;
			syncOccupationFromSideInfluence(idx);
			primaryOccupierMap[idx] = 0;
			return;
		}

		const ownerSideIdx = ownerToSideMap.get(ownerId);
		if (
			ownerSideIdx !== undefined &&
			ownerSideIdx < sideInfluenceMaps.length &&
			sides[ownerSideIdx].length > 0
		) {
			landMask[idx] = 2;
			for (let s = 0; s < sideInfluenceMaps.length; s++)
				sideInfluenceMaps[s][idx] = 0;
			sideInfluenceMaps[ownerSideIdx][idx] = 1.0;
			syncOccupationFromSideInfluence(idx);
			primaryOccupierMap[idx] = ownerId;
		} else {
			// Keep warzone if the cell still has occupation from a combatant side
			const hasOccupation = dominantSideMap[idx] !== -1;
			landMask[idx] = hasOccupation ? 2 : 1;
			if (!hasOccupation) {
				for (let s = 0; s < sideInfluenceMaps.length; s++)
					sideInfluenceMaps[s][idx] = 0;
				syncOccupationFromSideInfluence(idx);
			}
			primaryOccupierMap[idx] = 0;
		}
	});

	// RELEASABLE TRANSFER: Transfer any releasables owned by the capitulating country to the primary annexer
	countryMetadata.forEach((m) => {
		if (m && m.releasableBy === country.id) {
			m.releasableBy = primaryAnnexerId;
		}
	});

	// Make the capitulated country itself a releasable of the annexer and remember its old territory
	if (primaryAnnexerId > 0) {
		const victimMeta = countryMetadata.find((m) => m && m.id === country.id);
		if (victimMeta) {
			victimMeta.releasableBy = primaryAnnexerId;

			// Prefer the precise snapshot we made before any transfer; if empty, fall back to deJure cores
			if (victimTerritorySnapshot.length > 0) {
				victimMeta.savedCells = victimTerritorySnapshot;
			} else {
				const cells = [];
				for (let i = 0; i < deJureMap.length; i++) {
					if (deJureMap[i] === country.id) {
						const y = Math.floor(i / gridWidth);
						const x = i % gridWidth;
						cells.push([x, y]);
					}
				}
				victimMeta.savedCells = cells;
			}
		}
	}

	// Remove the country from its alliance list
	const cIdx = side.indexOf(country);
	if (cIdx > -1) side.splice(cIdx, 1);

	// Clear targets for any units that were focusing on this specific country's theater
	units.forEach((u) => {
		if (u.lastMopUpId === country.id) {
			u.mopUpTarget = null;
			u.lastMopUpId = null;
			u.targetSearchCooldown = 0;
		}
	});

	// Filter out all units belonging to the capitulated nation
	units = units.filter((u) => u.sovereignId !== country.id);

	// Sync provinces to new ownership
	generateProvinces();

	// Invalidate caches so the frontline field and adjacency reflect new borders
	adjacencyCache = null;
	frontlineFieldTick = -999;
	_workerBusy = false;
	_cachedFrontierCells = [];
	_frontierScanCounter = 0;
	_frontlinePolys = {};
	_neutralBorderPolys = {};
	_frontlinePolyTick = -999;

	// Refresh UI
	recalculateAllBounds();
	updateSidesUI();
	influenceLayer.render();
}

export function applyTreaty(type, winnerPoleOverride = null) {
	gameState = "WAR_OVER";
	playPeaceSound();

	// Stop recording if active
	if (mediaRecorder && mediaRecorder.state !== "inactive") {
		mediaRecorder.onstop = () => {
			const blob = new Blob(recordedChunks, { type: "video/webm" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `ModernWars_${Date.now()}.webm`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
			recordedChunks = [];
		};
		mediaRecorder.stop();
	}

	// Freeze time system at war end and reflect final date in the setup inputs
	if (gameTimeDate && timeYearInput && timeMonthInput && timeDayInput) {
		gameTimeEnabled = false;
		gameTimeAccumulatorMs = 0;
		timeYearInput.value = gameTimeDate.year;
		timeMonthInput.value = gameTimeDate.month;
		timeDayInput.value = gameTimeDate.day;
		if (gameDateDisplay) {
			gameDateDisplay.textContent = formatGameDate();
			gameDateDisplay.style.display = "block";
		}
	}

	const sideTerritory = new Array(sides.length).fill(0);
	for (let i = 0; i < dominantSideMap.length; i++) {
		if (landMask[i] === 2) {
			const ds = dominantSideMap[i];
			if (ds >= 0 && ds < sides.length) sideTerritory[ds]++;
		}
	}

	let winnerSideIdx = sideTerritory.indexOf(Math.max(...sideTerritory));
	if (typeof winnerPoleOverride === "number" && winnerPoleOverride >= 0)
		winnerSideIdx = winnerPoleOverride;

	let winnerName = "The Winner";
	const sideUnitCounts = sides.map((s, i) => ({
		idx: i,
		units: units.filter((u) => u.sideIndex === i).length,
		side: s,
	}));

	casualtyPanel.style.display = "none";

	const strongestWinner = sideUnitCounts
		.filter((s) => s.idx === winnerSideIdx)
		.sort((a, b) => b.units - a.units)[0];
	winnerName = strongestWinner?.side[0]
		? strongestWinner.side.length > 1
			? `${strongestWinner.side[0].name} Allies`
			: strongestWinner.side[0].name
		: document.querySelector(`[data-sidename="${winnerSideIdx}"]`)?.innerText ||
			`Side ${String.fromCharCode(65 + winnerSideIdx)}`;

	const isTotalCapitulation =
		type.includes("FULL_CAPITULATION") || type === "ANNEXATION";
	const isNegotiatedPeace = type === "PEACE_TREATY";

	if (isTotalCapitulation) {
		const loserNames = sides
			.filter((s, i) => i !== winnerSideIdx && s.length > 0)
			.map((s) => s[0]?.name || "Unknown")
			.join(", ");
		statusText.innerText = `Victory! ${winnerName} prevails${loserNames ? ` — ${loserNames} defeated` : ""}`;
		treatyMsg.innerText = "TOTAL ANNEXATION";
		document.getElementById("treaty-status").innerText =
			"The conflict has concluded";
		treatyAlert.style.display = "block";
	} else if (isNegotiatedPeace) {
		statusText.innerText = "Peace Treaty Signed";
		treatyMsg.innerText = "BORDERS REDRAWN";
		document.getElementById("treaty-status").innerText =
			"Territorial adjustments finalized";
		treatyAlert.style.display = "block";
	} else {
		statusText.innerText = "White Peace Signed";
	}

	const countryToSideMap = new Map();
	const countryToRoleMap = new Map();
	sides.forEach((side, idx) => {
		side.forEach((c) => {
			countryToSideMap.set(c.id, idx);
			countryToRoleMap.set(c.id, c.role || "OFFENSE");
		});
	});

	for (let i = 0; i < worldControlMap.length; i++) {
		if (landMask[i] === 2) {
			const originalOwner = worldControlMap[i];
			const occupierId = primaryOccupierMap[i];
			const ds = dominantSideMap[i];
			const occupierSideIdx = countryToSideMap.get(occupierId);
			const ownerSideIdx = countryToSideMap.get(originalOwner);

			let cellNewOwner = originalOwner;
			if (ds >= 0 && ds !== ownerSideIdx) {
				cellNewOwner =
					occupierSideIdx !== undefined && occupierSideIdx === ds
						? occupierId
						: sides[ds]?.[0]?.id || originalOwner;
			}

			if (cellNewOwner !== originalOwner && cellNewOwner > 0) {
				worldControlMap[i] = cellNewOwner;
			}

			if (isTotalCapitulation) {
				const currentOwner = worldControlMap[i];
				const currentSideIdx = countryToSideMap.get(currentOwner);
				const currentRole = countryToRoleMap.get(currentOwner);

				let newOwnerId = 0;
				if (
					currentSideIdx !== undefined &&
					currentSideIdx !== winnerSideIdx &&
					currentRole !== "SUPPORT"
				) {
					newOwnerId =
						occupierSideIdx !== undefined && occupierSideIdx === winnerSideIdx
							? occupierId
							: sides[winnerSideIdx]?.[0]?.id || 0;
				}

				if (newOwnerId > 0) {
					worldControlMap[i] = newOwnerId;
				}
			}

			landMask[i] = 1;
			clearCellInfluence(i);
		}
	}

	// Re-sync province map to final treaty borders to remove ghost province lines
	generateProvinces();

	// High-Performance Organic Border Smoothing: Uses frequency array to avoid GC pressure
	const smoothingPasses = 3;
	const maxId = countryMetadata.reduce(
		(max, m) => (m ? Math.max(max, m.id) : max),
		0,
	);
	const sideLookup = new Int8Array(maxId + 1).fill(-1);
	countryToSideMap.forEach((side, id) => {
		if (id <= maxId) sideLookup[id] = side;
	});

	// Static buffers to avoid re-allocation in loops
	const freq = new Uint16Array(maxId + 1);
	const activeIds = new Uint32Array(9);

	// Transfer Releasables: Move all releasables belonging to defeated countries to their new primary owners
	const ownerTransferMap = new Map();
	// Use sample points to find which countries lost land and who took it
	for (let i = 0; i < worldControlMap.length; i += 500) {
		if (landMask[i] === 2) {
			const currentOwner = worldControlMap[i];
			const originalOwner = deJureMap[i]; // Approximate previous owner
			if (currentOwner !== originalOwner && originalOwner > 0) {
				ownerTransferMap.set(originalOwner, currentOwner);
			}
		}
	}
	countryMetadata.forEach((m) => {
		if (m?.releasableBy && ownerTransferMap.has(m.releasableBy)) {
			m.releasableBy = ownerTransferMap.get(m.releasableBy);
		}
	});

	for (let p = 0; p < smoothingPasses; p++) {
		const tempMap = new Uint16Array(worldControlMap);
		for (let y = 1; y < gridHeight - 1; y++) {
			const rowIdx = y * gridWidth;
			for (let x = 1; x < gridWidth - 1; x++) {
				const idx = rowIdx + x;
				if (landMask[idx] === 0) continue;

				let activeCount = 0;
				let maxFreq = 0;
				let winner = worldControlMap[idx];

				// Sample 3x3 neighborhood
				for (let dy = -1; dy <= 1; dy++) {
					const rOff = dy * gridWidth;
					for (let dx = -1; dx <= 1; dx++) {
						const owner = worldControlMap[idx + rOff + dx];
						if (owner > 0) {
							if (freq[owner] === 0) activeIds[activeCount++] = owner;
							freq[owner]++;
							if (freq[owner] > maxFreq) {
								maxFreq = freq[owner];
								winner = owner;
							}
						}
					}
				}

				// Apply majority rule
				if (maxFreq >= 6) tempMap[idx] = winner;

				// Cleanup frequency array for next pixel
				for (let i = 0; i < activeCount; i++) freq[activeIds[i]] = 0;
			}
		}
		worldControlMap.set(tempMap);
	}

	units = [];
	unitSpatialHash.clear();
	aiCountryState.clear();
	_warPlan = [];
	activeBattles = []; _battleHash.clear();
	bombs = [];
	explosions = [];
	bases = [];
	recalculateAllBounds();
	influenceLayer.render();

	setTimeout(() => {
		treatyAlert.style.display = "none";
		resetToSelection();
		if (randomWarMode) {
			setTimeout(triggerRandomWar, 1500);
		}
	}, 2500);
}

export function handleRebellionPeace() {
	if (!activeRebellion) return;
	const { rebelId, overlordId } = activeRebellion;

	gameState = "WAR_OVER";
	playPeaceSound();

	// Freeze time system at war end and reflect final date in the setup inputs
	if (gameTimeDate && timeYearInput && timeMonthInput && timeDayInput) {
		gameTimeEnabled = false;
		gameTimeAccumulatorMs = 0;
		timeYearInput.value = gameTimeDate.year;
		timeMonthInput.value = gameTimeDate.month;
		timeDayInput.value = gameTimeDate.day;
		if (gameDateDisplay) {
			gameDateDisplay.textContent = formatGameDate();
			gameDateDisplay.style.display = "block";
		}
	}

	statusText.innerText = "Rebellion Successful: Borders Restored";
	treatyMsg.innerText = "INDEPENDENCE RECOGNIZED";
	document.getElementById("treaty-status").innerText =
		"Post-colonial borders enforced";
	treatyAlert.style.display = "block";

	// Special Peace Condition:
	// 1. Rebel gets its de jure land back.
	// 2. Overlord gets its de jure land back (even if captured by rebel during war).
	// 3. Any other land involved stabilized.

	for (let i = 0; i < worldControlMap.length; i++) {
		if (landMask[i] === 2) {
			const djId = deJureMap[i];
			if (djId === rebelId) {
				worldControlMap[i] = rebelId;
			} else if (djId === overlordId) {
				worldControlMap[i] = overlordId;
			} else {
				// If it was some other land captured during the chaos, return to original
				if (djId > 0) worldControlMap[i] = djId;
			}

			landMask[i] = 1;
			clearCellInfluence(i);
			primaryOccupierMap[i] = 0;
		}
	}

	activeRebellion = null;
	units = [];
	bombs = [];

	// Sync provinces back to restored de jure borders
	generateProvinces();
	explosions = [];
	bases = [];
	recalculateAllBounds();
	influenceLayer.render();

	setTimeout(() => {
		treatyAlert.style.display = "none";
		resetToSelection();
	}, 3000);
}

export function resetToSelection() {
	stopWarAmbiance();
	// Stop in‑game time progression but keep the last war date visible in the setup
	gameTimeEnabled = false;
	gameTimeAccumulatorMs = 0;
	if (gameTimeDate && timeYearInput && timeMonthInput && timeDayInput) {
		timeYearInput.value = gameTimeDate.year;
		timeMonthInput.value = gameTimeDate.month;
		timeDayInput.value = gameTimeDate.day;
		if (gameDateDisplay) {
			gameDateDisplay.textContent = formatGameDate();
			gameDateDisplay.style.display = "block";
		}
	}

	// If in God Mode, we reset the underlying state that will be restored on exit
	if (godModeActive) {
		preGodModeState = "SELECTING_P1";
	}

	if (gameMode === "EDITOR" || gameMode === "EDITOR_TEST") {
		if (gameMode === "EDITOR_TEST") {
			gameMode = "EDITOR";
			editorToolbox.style.display = "flex";
		}
		if (!godModeActive) {
			gameState = "EDITOR_ACTIVE";
			statusText.innerText = "Map Editor (Alpha)";
		}
		setupPanel.style.display = "none";
		statsPanel.style.display = "none";
		resetBtn.style.display = "block";
		ffBtn.style.display = "none";
		forcePeaceBtn.style.display = "none";
		unitCountsDiv.style.display = "none";
		updateRestartVisibility();
		influenceLayer.render();
		if (!godModeActive) return;
	}
	gameState = "SELECTING_P1";
	sides = [[], []];
	_attackers = sides[0];
	_defenders = sides[1];
	activeSideIndex = 0;
	ffaMode = false;
	ffaToggleBtn.style.border = "none";
	ffaToggleBtn.innerText = "FFA Mode";
	units = [];
	unitSpatialHash.clear();
	activeBattles = []; _battleHash.clear();
	bombs = [];
	explosions = [];
	bases = [];
	setSpeed(0);
	frameAccumulator = 0;

	statusText.innerText = "Select First Country";
	setupPanel.style.display = "block";
	setupOptions.style.display = "none";

	updateSidesUI();

	statsPanel.style.display = "none";
	document.getElementById("game-status").style.display = "flex"; // Restore if cinematic
	casualtyPanel.style.display = "none";
	resetBtn.style.display = currentScenarioContext ? "block" : "none";
	restartScenarioBtn.style.display = "block";
	document.getElementById("speed-controls").style.display = "none";
	godModeBtn.style.display =
		gameMode === "CONQUEST" || godModeActive ? "block" : "none";
	godBombBtn.style.display = "none";
	godBombActive = false;
	godBombSourceId = -1;
	godBombBtn.innerText = "GOD BOMB: OFF";
	godBombBtn.classList.remove("active");
	forcePeaceBtn.style.display = "none";
	unitCountsDiv.style.display = "none";
}

export async function resetGame() {
	cancelAnimationFrame(animationFrameId);

	// Scenario-specific reset: Reload the original preset if available
	if (currentScenarioContext?.blobUrl) {
		loadingStatus.innerText = "Reloading Scenario Assets...";
		loadingOverlay.style.display = "flex";
		try {
			const response = await fetch(currentScenarioContext.blobUrl);
			if (!response.ok) throw new Error("Reload failed");
			const blob = await response.blob();
			await performPresetLoad(blob, gameMode);
			return;
		} catch (e) {
			console.error("Satellite Reset Failed:", e);
		}
	}

	worldControlMap.fill(0);
	occupationMap.fill(0);
	resetSideInfluenceMaps();
	landMask.fill(0);
	resetToSelection();
	updateRestartVisibility();
	// Re-initialize landmask from features
	const mapRes = document.getElementById("map-res-select").value;
	const geoUrl = `${CONFIG.GEOJSON_BASE}${mapRes}/cultural/ne_${mapRes}_admin_0_countries.json`;
	loadCountries(geoUrl, gameMode === "EDITOR");
}

/**
 * INTERACTION
 */
export function findCityAtLatLng(latlng) {
	if (!cities || cities.length === 0) return null;
	const pt = map.latLngToContainerPoint(latlng);
	const maxDistSq = 8 * 8;
	let best = null;
	let bestDistSq = maxDistSq;

	const bounds = map.getBounds();
	cities.forEach((c) => {
		if (c.lat == null || c.lng == null) return;
		if (!bounds.contains([c.lat, c.lng])) return;
		const cp = map.latLngToContainerPoint([c.lat, c.lng]);
		const dx = cp.x - pt.x;
		const dy = cp.y - pt.y;
		const d2 = dx * dx + dy * dy;
		if (d2 < bestDistSq) {
			bestDistSq = d2;
			best = c;
		}
	});
	return best;
}

map.on("click", (e) => {
	const originalEvent = e.originalEvent || e;

	// City move / create modes take priority
	if (
		(gameMode === "EDITOR" || godModeActive) &&
		cityEditMode === "MOVE" &&
		editingCityId > 0
	) {
		const city = cities.find((c) => c.id === editingCityId);
		if (city) {
			city.lat = e.latlng.lat;
			city.lng = e.latlng.lng;
			statusText.innerText = `Moved ${city.name} to new position`;
			cityEditMode = null;
			cityInspector.style.display = "block";
			influenceLayer.render();
			return;
		}
		cityEditMode = null;
	}

	if ((gameMode === "EDITOR" || godModeActive) && cityEditMode === "CREATE") {
		const newId =
			(cities.length ? Math.max(...cities.map((c) => c.id || 0)) : 0) + 1;
		const idx = getGridIndex(e.latlng.lat, e.latlng.lng);
		const ownerId = idx !== -1 ? worldControlMap[idx] : null;
		const newCity = {
			id: newId,
			name: "New City",
			lat: e.latlng.lat,
			lng: e.latlng.lng,
			pop: 0,
			isCapital: false,
			ownerId: ownerId,
			isCustom: true,
		};
		cities.push(newCity);
		activeTheaterCities = cities;
		statusText.innerText =
			"New city created. Use the City Inspector to name and assign it.";
		cityEditMode = null;
		openCityInspector(newId);
		influenceLayer.render();
		return;
	}

	// City click detection (editor / god mode)
	if (gameMode === "EDITOR" || godModeActive) {
		const city = findCityAtLatLng(e.latlng);
		if (city) {
			openCityInspector(city.id);
			return;
		}
	}
	// Outside editor/god mode, city clicks do nothing (no popup)

	handleCountryClick(null, null, e.latlng, originalEvent);
});

map.on("mousemove", (e) => {
	coordsDisplay.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
});

viewModeBtn.addEventListener("click", () => {
	// Cycle between POLITICAL <-> FLAG; alliance overlay is controlled separately by its own toggle
	if (viewMode === "POLITICAL") {
		viewMode = "FLAG";
		viewModeBtn.innerText = "FLAG VIEW";
		viewModeBtn.style.background = "#8e44ad";
	} else {
		viewMode = "POLITICAL";
		viewModeBtn.innerText = "POLITICAL";
		viewModeBtn.style.background = "#3498db";
	}

	// When switching view modes mid‑war, force a fresh recompute of country
	// bounds and occupation visuals so frontlines don't appear to vanish.
	if (
		gameState === "SIMULATING" ||
		(godModeActive && preGodModeState === "SIMULATING")
	) {
		if (typeof recalculateAllBounds === "function") {
			recalculateAllBounds();
		}
	}

	if (influenceLayer && typeof influenceLayer._update === "function") {
		influenceLayer._forceRender = true;
		influenceLayer._update();
	} else if (influenceLayer) {
		influenceLayer.render();
	}
});

if (allianceViewCheckbox) {
	allianceViewCheckbox.checked = allianceViewEnabled;
	allianceViewCheckbox.addEventListener("change", (e) => {
		allianceViewEnabled = e.target.checked;
		if (arrowsToggleBtn) {
			arrowsToggleBtn.classList.toggle("active", allianceViewEnabled);
		}
		if (influenceLayer) {
			influenceLayer._forceRender = true;
			if (typeof influenceLayer._update === "function")
				influenceLayer._update();
			else influenceLayer.render();
		}
	});
}

battlesToggleBtn.addEventListener("click", () => {
	showBattleIndicators = !showBattleIndicators;
	battlesToggleBtn.classList.toggle("active", showBattleIndicators);
	influenceLayer.render();
});

if (labelsToggleBtn) {
	labelsToggleBtn.classList.toggle("active", showCountryLabels);
	labelsToggleBtn.addEventListener("click", () => {
		showCountryLabels = !showCountryLabels;
		// Clear cached anchors whenever label mode changes so they can be re-anchored once
		countryLabelAnchors.clear();
		labelsToggleBtn.classList.toggle("active", showCountryLabels);
		// Force a full redraw so labels respond instantly, even outside active wars
		if (influenceLayer) {
			influenceLayer._forceRender = true;
			if (typeof influenceLayer._update === "function") {
				influenceLayer._update();
			} else {
				influenceLayer.render();
			}
		}
	});
}

if (citiesToggleBtn) {
	citiesToggleBtn.classList.toggle("active", showNonCapitalCities);
	citiesToggleBtn.addEventListener("click", () => {
		showNonCapitalCities = !showNonCapitalCities;
		citiesToggleBtn.classList.toggle("active", showNonCapitalCities);
		if (influenceLayer) influenceLayer.render();
	});
}

if (warplansToggleBtn) {
	warplansToggleBtn.classList.toggle("active", showWarPlans);
	warplansToggleBtn.addEventListener("click", () => {
		showWarPlans = !showWarPlans;
		warplansToggleBtn.classList.toggle("active", showWarPlans);
		if (influenceLayer) influenceLayer.render();
	});
}

// UI settings tab wiring
const showWarplansCheckbox = document.getElementById("show-warplans-checkbox");
const showLabelsCheckbox = document.getElementById("show-labels-checkbox");
const showCitiesCheckbox = document.getElementById("show-cities-checkbox");
const showBattlesCheckbox = document.getElementById("show-battles-checkbox");
const showAllianceCheckbox = document.getElementById("show-alliance-checkbox");

// Load saved UI preferences
if (getCookie("mw_show_warplans") === "false") {
	showWarPlans = false;
	if (showWarplansCheckbox) showWarplansCheckbox.checked = false;
}
if (getCookie("mw_show_labels") === "false") {
	showCountryLabels = false;
	if (showLabelsCheckbox) showLabelsCheckbox.checked = false;
}
if (getCookie("mw_show_cities") === "false") {
	showNonCapitalCities = false;
	if (showCitiesCheckbox) showCitiesCheckbox.checked = false;
}
if (getCookie("mw_show_battles") === "true") {
	showBattleIndicators = true;
	if (showBattlesCheckbox) showBattlesCheckbox.checked = true;
} else if (getCookie("mw_show_battles") === "false") {
	showBattleIndicators = false;
	if (showBattlesCheckbox) showBattlesCheckbox.checked = false;
}
if (getCookie("mw_show_alliance") === "true") {
	allianceViewEnabled = true;
	if (showAllianceCheckbox) showAllianceCheckbox.checked = true;
}

if (showWarplansCheckbox) {
	showWarplansCheckbox.checked = showWarPlans;
	showWarplansCheckbox.addEventListener("change", (e) => {
		showWarPlans = e.target.checked;
		if (warplansToggleBtn) warplansToggleBtn.classList.toggle("active", showWarPlans);
		setCookie("mw_show_warplans", e.target.checked ? "true" : "false");
		if (influenceLayer) influenceLayer.render();
	});
}
if (showLabelsCheckbox) {
	showLabelsCheckbox.checked = showCountryLabels;
	showLabelsCheckbox.addEventListener("change", (e) => {
		showCountryLabels = e.target.checked;
		countryLabelAnchors.clear();
		if (labelsToggleBtn) labelsToggleBtn.classList.toggle("active", showCountryLabels);
		setCookie("mw_show_labels", e.target.checked ? "true" : "false");
		if (influenceLayer) {
			influenceLayer._forceRender = true;
			if (typeof influenceLayer._update === "function") influenceLayer._update();
			else influenceLayer.render();
		}
	});
}
if (showCitiesCheckbox) {
	showCitiesCheckbox.checked = showNonCapitalCities;
	showCitiesCheckbox.addEventListener("change", (e) => {
		showNonCapitalCities = e.target.checked;
		if (citiesToggleBtn) citiesToggleBtn.classList.toggle("active", showNonCapitalCities);
		setCookie("mw_show_cities", e.target.checked ? "true" : "false");
		if (influenceLayer) influenceLayer.render();
	});
}
if (showBattlesCheckbox) {
	showBattlesCheckbox.checked = showBattleIndicators;
	showBattlesCheckbox.addEventListener("change", (e) => {
		showBattleIndicators = e.target.checked;
		if (battlesToggleBtn) battlesToggleBtn.classList.toggle("active", showBattleIndicators);
		setCookie("mw_show_battles", e.target.checked ? "true" : "false");
		if (influenceLayer) influenceLayer.render();
	});
}
if (showAllianceCheckbox) {
	showAllianceCheckbox.checked = allianceViewEnabled;
	showAllianceCheckbox.addEventListener("change", (e) => {
		allianceViewEnabled = e.target.checked;
		if (allianceViewCheckbox) allianceViewCheckbox.checked = allianceViewEnabled;
		setCookie("mw_show_alliance", e.target.checked ? "true" : "false");
		if (influenceLayer) influenceLayer.render();
	});
}

// Sync mountain toggles
if (noPeaceCheckbox) {
	noPeaceCheckbox.addEventListener("change", () => {
		peaceTreatiesDisabled = noPeaceCheckbox.checked;
	});
}

if (cityFocusCheckbox) {
	cityFocusCheckbox.addEventListener("change", () => {
		cityFocusMode = cityFocusCheckbox.checked;
	});
}

setupDisableMountainsCheckbox.addEventListener("change", async (e) => {
	const disabled = e.target.checked;
	mountainsEnabled = !disabled;
	mainDisableMountainsCheckbox.checked = disabled;
	// Persist immediately
	setCookie("mw_disable_mountains", disabled ? "true" : "false");

	if (mountainsEnabled && terrainMask.every((v) => v === 0)) {
		const currentMapRes = document.getElementById("map-res-select").value;
		await loadTerrain(currentMapRes);
	}
	influenceLayer.render();
});

mainDisableMountainsCheckbox.addEventListener("change", (e) => {
	setupDisableMountainsCheckbox.checked = e.target.checked;
	mountainsEnabled = !e.target.checked;
	// Persist immediately
	setCookie("mw_disable_mountains", e.target.checked ? "true" : "false");
	influenceLayer.render();
});

// Sync province toggles
setupDisableProvincesCheckbox.addEventListener("change", (e) => {
	const disabled = e.target.checked;
	_provincesEnabled = !disabled;
	mainDisableProvincesCheckbox.checked = disabled;
	// Persist immediately
	setCookie("mw_disable_provinces", disabled ? "true" : "false");
	influenceLayer.render();
});

mainDisableProvincesCheckbox.addEventListener("change", (e) => {
	const disabled = e.target.checked;
	setupDisableProvincesCheckbox.checked = disabled;
	_provincesEnabled = !disabled;
	// Persist immediately
	setCookie("mw_disable_provinces", disabled ? "true" : "false");
	influenceLayer.render();
});

restartScenarioBtn.addEventListener("click", resetGame);

// QUICK RESTART: instant in‑memory reset back to scenario start without loading overlay
if (quickRestartBtn) {
	quickRestartBtn.addEventListener("click", () => {
		// If we never captured a snapshot (e.g. user hits quick restart before a war),
		// just fall back to the heavy reset.
		if (
			!initialWorldControlMapSnapshot ||
			!initialDeJureMapSnapshot ||
			!initialProvinceMapSnapshot ||
			!initialLandMaskSnapshot
		) {
			resetGame();
			return;
		}

		// Stop any running simulation loops and sounds but do NOT show the loading overlay.
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		if (backgroundTickId) {
			clearInterval(backgroundTickId);
			backgroundTickId = null;
		}
		stopWarAmbiance();

		// Restore core grid state
		worldControlMap.set(initialWorldControlMapSnapshot);
		deJureMap.set(initialDeJureMapSnapshot);
		provinceMap.set(initialProvinceMapSnapshot);
		landMask.set(initialLandMaskSnapshot);
		if (initialBiomeMaskSnapshot) biomeMask.set(initialBiomeMaskSnapshot);

		// Restore metadata and cities from snapshots
		// structuredClone preserves Infinity, NaN, and typed arrays correctly.
		if (initialCountryMetadataSnapshot) {
			countryMetadata = initialCountryMetadataSnapshot.map((m) => {
				if (!m) return null;
				// Create a fresh shallow copy to avoid mutating the snapshot
				const newMeta = { ...m };
				// Re-initialize bounds correctly if they were lost or corrupted
				newMeta.bounds = {
					minX: Infinity,
					maxX: -Infinity,
					minY: Infinity,
					maxY: -Infinity,
				};

				// Restore the Drawable Image object for flags
				if (newMeta.flagUrl) {
					const img = new Image();
					img.crossOrigin = "anonymous";
					img.onload = () => {
						if (influenceLayer) influenceLayer.render();
					};
					img.src = newMeta.flagUrl;
					newMeta.tempFlag = img;
				}
				return newMeta;
			});
		}

		if (initialCitiesSnapshot) {
			cities = initialCitiesSnapshot.map((c) => ({ ...c }));
		}

		// Hide loading screen just in case it was triggered by a fallback
		loadingOverlay.style.display = "none";

		// Clear all dynamic war state
		occupationMap.fill(0);
		resetSideInfluenceMaps();
		primaryOccupierMap.fill(0);
		bombs = [];
		explosions = [];
		bases = [];
		activeBattles = []; _battleHash.clear();
		capitalLostCountries = new Set();
		activeRebellion = null;
		countryCasualties.clear();
		casualtyByAttacker.clear();
		latestCountryStats.clear();
		selectedCountryIds.clear();

		// Reset time system and manpower to pristine state
		gameTimeEnabled = false;
		gameTimeDate = null;
		gameTimeAccumulatorMs = 0;
		if (gameDateDisplay) {
			gameDateDisplay.style.display = "none";
		}
		sideSoldiers.fill(0);
		initialSideSoldiers.fill(0);
		soldiersPerUnit.fill(CONFIG.UNIT_TO_SOLDIER_RATIO);
		sideCasualties.fill(0);

		// Reset sides / selection but keep the active scenario context
		sides = [[], []];
		_attackers = sides[0];
		_defenders = sides[1];
		activeSideIndex = 0;
		ffaMode = false;

		// Reset UI back to conflict setup with no loading screen
		gameState = "SELECTING_P1";
		statusText.innerText = getTranslation("SELECT_P1");
		setupPanel.style.display = "block";
		setupOptions.style.display = "none";
		statsPanel.style.display = "none";
		casualtyPanel.style.display = "none";
		document.getElementById("speed-controls").style.display = "none";
		godModeBtn.style.display = gameMode === "CONQUEST" ? "block" : "none";
		forcePeaceBtn.style.display = "none";
		unitCountsDiv.style.display = "none";
		treatyAlert.style.display = "none";
		frameAccumulator = 0;
		simFrameCount = 0;
		setSpeed(0);
		updateSidesUI();
		updateRestartVisibility();
		recalculateAllBounds();

		// Force an immediate high-priority redraw of the canvas layer
		if (influenceLayer) {
			influenceLayer._forceRender = true;
			if (typeof influenceLayer._update === "function") {
				influenceLayer._update();
			} else {
				influenceLayer.render();
			}
		}
	});
}

resetBtn.addEventListener("click", resetGame);

// In‑game MENU button: return to main menu without full page reload
mainMenuBtn.addEventListener("click", () => {
	// Stop any running simulation loops
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	if (backgroundTickId) {
		clearInterval(backgroundTickId);
		backgroundTickId = null;
	}
	stopWarAmbiance();

	// Reset high‑level state to menu
	gameState = "MAIN_MENU";
	gameMode = "CONQUEST";
	isPaused = false;

	// Hide in‑game UI and show main menu
	mapUi.style.display = "none";
	settingsOverlay.style.display = "none";
	loadingOverlay.style.display = "none";
	scenarioHubModal.style.display = "none";
	tutorialOverlay.style.display = "none";
	if (leaderboardOverlay) leaderboardOverlay.style.display = "none";
	mainMenu.style.display = "flex";

	// Ensure background music resumes when returning to the main menu
	initAudio();

	// Make sure restart/menu visibility is updated for when you re‑enter a scenario
	updateRestartVisibility();
});

startBtn.addEventListener("click", () => {
	activeRebellion = null;
	startWar();
});

if (rebellionBtn) {
	// Rebellions are disabled; keep this button inert.
	rebellionBtn.addEventListener("click", () => {
		alert("Rebellions have been disabled in this build.");
	});
}

editorUpdateBtn.addEventListener("click", async () => {
	if (!activeScenarioId) return;
	if (
		!confirm(
			"Update existing scenario? This will overwrite the map file and thumbnail on the Hub.",
		)
	)
		return;

	setLoadingThematic(false);
	loadingStatus.innerText = "Updating Scenario...";
	loadingOverlay.style.display = "flex";

	try {
		// 1. Generate updated preview
		let previewUrl = null;
		if (influenceLayer?._container) {
			influenceLayer._isCapturing = true;
			influenceLayer.render();
			const canvas = influenceLayer._container;
			const previewBlob = await new Promise((resolve) =>
				canvas.toBlob(resolve, "image/jpeg", 0.8),
			);
			influenceLayer._isCapturing = false;
			influenceLayer.render();
			if (previewBlob) {
				const previewFile = new File([previewBlob], "update_preview.jpg", {
					type: "image/jpeg",
				});
				previewUrl = await websim.upload(previewFile);
			}
		}

		// 2. Generate updated preset data
		const currentName = statusText.innerText
			.replace("REMIXING: ", "")
			.replace("Map Editor (Alpha)", "Updated Scenario");
		const saveData = generatePresetData(currentName);
		const blob = new Blob([JSON.stringify(saveData)], {
			type: "application/json",
		});
		const file = new File([blob], "updated_scenario.json", {
			type: "application/json",
		});
		const blobUrl = await websim.upload(file);

		// 3. Update existing record
		await room.collection("scenario_v1").update(activeScenarioId, {
			previewUrl: previewUrl,
			blobUrl: blobUrl,
		});

		loadingOverlay.style.display = "none";
		alert("Scenario updated successfully!");
	} catch (e) {
		console.error(e);
		alert("Update failed. You can only update scenarios you created.");
		loadingOverlay.style.display = "none";
	}
});

godModeBtn.addEventListener("click", () => {
	if (!godModeActive) {
		// Activate God Mode
		godModeActive = true;
		godBombActive = false;
		if (godBombBtn) {
			godBombBtn.innerText = "GOD BOMB: OFF";
			godBombBtn.classList.remove("active");
		}
		preGodModeState = gameState;
		gameState = "EDITOR_ACTIVE";

		godModeBtn.innerText = getTranslation("GOD_ACTIVE");
		godModeBtn.style.background = "#27ae60";

		// Setup UI
		editorToolbox.style.display = "flex";
		setupPanel.style.display = "none";
		statsPanel.style.display = "none";
		// Allow sharing and saving any current map state from God Mode, including official presets
		editorShareBtn.style.display = "block";
		editorSaveBtn.style.display = "block";
		editorHubBtn.style.display = "block";
		editorLibraryBtn.style.display = "block";
		shareFlagBtn.style.display = "block";
		editorExitBtn.style.display = "none";
		editorTestBtn.style.display = "none";
		editorUpdateBtn.style.display = activeScenarioId ? "block" : "none";
		editorUnclaimBtn.style.display = "block";

		if (preGodModeState === "SIMULATING") {
			godBombBtn.style.display = "block";
		}

		// Ensure alliance view toggle always remains visible while in God Mode
		if (allianceViewCheckbox?.parentElement) {
			allianceViewCheckbox.style.display = "inline-block";
			allianceViewCheckbox.parentElement.style.display = "inline-flex";
		}

		statusText.innerText = currentScenarioContext
			? `GOD MODE // REMIXING: ${currentScenarioContext.name}`
			: "GOD MODE: Map Editing Active";
		updateRestartVisibility();
	} else {
		// Deactivate God Mode
		godModeActive = false;
		godBombActive = false;
		godBombSourceId = -1;

		// Sanitize state: ensure that exiting from an active editor tool (like painting)
		// doesn't leave the engine in an "EDITOR" state if we were previously in selection mode.
		if (gameMode === "CONQUEST" && preGodModeState !== "SIMULATING") {
			gameState = "SELECTING_P1";
		} else {
			gameState = preGodModeState;
		}

		godModeBtn.innerText = getTranslation("GOD_MODE");
		godModeBtn.style.background = "#d35400";

		// Hide editor UI & Reset Tool Classes to prevent sticky sub-states
		editorToolbox.style.display = "none";
		[
			editorPaintBtn,
			editorFillBtn,
			editorUnclaimBtn,
			editorTerrainBtn,
			editorPlaceDivisionBtn,
		].forEach((btn) => {
			if (btn) btn.classList.remove("active");
		});
		if (brushControls) brushControls.style.display = "none";
		if (terrainControls) terrainControls.style.display = "none";

		godBombBtn.style.display = "none";
		godBombBtn.innerText = "GOD BOMB: OFF";
		godBombBtn.classList.remove("active");
		countryInspector.style.display = "none";
		shareFlagBtn.style.display = "none";
		map.getContainer().classList.remove("painting-cursor");

		// Make sure the alliance view checkbox + label are visible again when returning to normal play
		if (allianceViewCheckbox?.parentElement) {
			allianceViewCheckbox.style.display = "inline-block";
			allianceViewCheckbox.parentElement.style.display = "inline-flex";
		}

		// Refresh simulation caches in case land changed
		if (gameState === "SIMULATING") {
			statsPanel.style.display = "block";
			activeTheaterCities = cities.filter((c) => {
				const idx = getGridIndex(c.lat, c.lng);
				return idx !== -1 && landMask[idx] === 2;
			});
			// Ensure loop restarts if it was stopped
			cancelAnimationFrame(animationFrameId);
			requestAnimationFrame(updateLoop);
		}

		if (gameState.startsWith("SELECTING") || gameState === "WAR_OVER") {
			if (gameState === "WAR_OVER") gameState = "SELECTING_P1";
			setupPanel.style.display = "block";
			statusText.innerText = currentScenarioContext
				? `PLAYING: ${currentScenarioContext.name}`
				: getTranslation("SELECT_P1");
			updateSidesUI();
		} else if (gameState === "SIMULATING") {
			statsPanel.style.display = "block";
			statusText.innerText = ffaMode
				? "Free For All Active"
				: "Global Conflict Active";
		} else {
			// Safety fallback: transition any orphaned state to setup mode
			gameState = "SELECTING_P1";
			setupPanel.style.display = "block";
			statusText.innerText = getTranslation("SELECT_P1");
			updateSidesUI();
		}
		updateRestartVisibility();
	}
});

godBombBtn.addEventListener("click", () => {
	godBombActive = !godBombActive;
	godBombBtn.innerText = godBombActive ? "GOD BOMB: ON" : "GOD BOMB: OFF";
	godBombBtn.classList.toggle("active", godBombActive);

	if (godBombActive) {
		godBombSourceId = -1;
		statusText.innerText = "GOD BOMB ACTIVE: Click a country to set as sender";
		map.getContainer().classList.add("painting-cursor");
		countryInspector.style.display = "none";
	} else {
		godBombSourceId = -1;
		statusText.innerText = godModeActive
			? "GOD MODE: Map Editing Active"
			: "Simulation Continued";
		map.getContainer().classList.remove("painting-cursor");
	}
});

forcePeaceBtn.addEventListener("click", () => {
	if (gameState === "SIMULATING") {
		gameState = "PEACE_SELECT_1";
		statusText.innerText = "DIPLOMACY: Click nation to withdraw from war";
		peaceSelection1 = null;
	} else if (gameState === "PEACE_SELECT_1" || gameState === "PEACE_SELECT_2") {
		// Double click/cancel to just do a global peace
		if (confirm("Sign global white peace for all remaining combatants?")) {
			applyTreaty("PEACE_TREATY");
		} else {
			gameState = "SIMULATING";
			statusText.innerText = "Conflict Continued";
			requestAnimationFrame(updateLoop);
		}
	}
});

export function unilateralExitConflict(country, sideIdx) {
	if (sideIdx === -1) return;

	for (let i = 0; i < worldControlMap.length; i++) {
		if (landMask[i] !== 2) continue;

		const ownerId = worldControlMap[i];
		const occupierId = primaryOccupierMap[i];

		if (occupierId === country.id) {
			if (dominantSideMap[i] === sideIdx) {
				worldControlMap[i] = country.id;
			}
			landMask[i] = 1;
			clearCellInfluence(i);
			primaryOccupierMap[i] = 0;
		} else if (ownerId === country.id) {
			if (dominantSideMap[i] !== -1 && dominantSideMap[i] !== sideIdx) {
				worldControlMap[i] = occupierId > 0 ? occupierId : ownerId;
			}
			landMask[i] = 1;
			clearCellInfluence(i);
			primaryOccupierMap[i] = 0;
		}
	}

	// Remove from sides
	const side = sides[sideIdx];
	const idx = side.findIndex((c) => c.id === country.id);
	if (idx > -1) side.splice(idx, 1);

	// Purge units
	units = units.filter((u) => u.sovereignId !== country.id);
	units.forEach((u) => {
		if (u.beneficiaryId === country.id) u.beneficiaryId = u.sovereignId;
	});

	// Global cleanup for neutral land that might be stuck in war state
	const combatantIds = new Set(sides.flat().map((c) => c.id));
	for (let i = 0; i < worldControlMap.length; i++) {
		if (
			landMask[i] === 2 &&
			!combatantIds.has(worldControlMap[i]) &&
			Math.abs(occupationMap[i]) < 0.01
		) {
			landMask[i] = 1;
			clearCellInfluence(i);
			primaryOccupierMap[i] = 0;
		}
	}

	generateProvinces();
	recalculateAllBounds();
	updateSidesUI();
	influenceLayer.render();

	playPeaceSound();
	statusText.innerText = `${country.name} has exited the conflict and annexed occupied land.`;

	const activePoles = new Set();
	sides.forEach((s, idx) => {
		if (s.length > 0) activePoles.add(idx);
	});

	if (activePoles.size < 2) {
		applyTreaty("PEACE_TREATY");
	}
}

export function _signSelectivePeace(exiter, target) {
	let exiterSideIdx = -1;
	let targetSideIdx = -1;

	sides.forEach((s, i) => {
		if (s.some((c) => c.id === exiter.id)) exiterSideIdx = i;
		if (s.some((c) => c.id === target.id)) targetSideIdx = i;
	});

	if (
		exiterSideIdx === -1 ||
		targetSideIdx === -1 ||
		exiterSideIdx === targetSideIdx
	) {
		alert("Diplomatic error: Negotiating nations must be on opposing sides.");
		gameState = "SIMULATING";
		statusText.innerText = "Conflict Continued";
		requestAnimationFrame(updateLoop);
		return;
	}

	// The 'target' (second nation clicked) is the one exiting the specific conflict engagement
	for (let i = 0; i < worldControlMap.length; i++) {
		if (landMask[i] !== 2) continue;

		const ownerId = worldControlMap[i];
		const occupierId = primaryOccupierMap[i];
		const ds = dominantSideMap[i];

		if (ownerId === target.id) {
			if (ds !== -1 && ds !== targetSideIdx) {
				// Annexation: Give land to the specific occupier
				worldControlMap[i] = occupierId > 0 ? occupierId : exiter.id;
				landMask[i] = 1;
				clearCellInfluence(i);
				primaryOccupierMap[i] = 0;
			}
		}
		// B) If the target (leaving nation) is occupying someone else's land, it gets annexed by the target
		else if (occupierId === target.id) {
			if (ds === targetSideIdx) {
				worldControlMap[i] = target.id;
				landMask[i] = 1;
				clearCellInfluence(i);
			} else {
				clearCellInfluence(i);
			}
			primaryOccupierMap[i] = 0;
		}
	}

	// 2. Remove the target country from its alliance list
	const targetSide = sides[targetSideIdx];
	const idx = targetSide.findIndex((c) => c.id === target.id);
	if (idx > -1) targetSide.splice(idx, 1);

	// 3. Purge units belonging to the target nation
	units = units.filter((u) => u.sovereignId !== target.id);

	// Reset beneficiary IDs for units that were supporting the leaving nation
	units.forEach((u) => {
		if (u.beneficiaryId === target.id) u.beneficiaryId = u.sovereignId;
	});

	// 4. Final Sweep: Stabilize land owned by nations no longer in the war
	const combatantIds = new Set(sides.flat().map((c) => c.id));
	for (let i = 0; i < worldControlMap.length; i++) {
		if (landMask[i] === 2) {
			const ownerId = worldControlMap[i];
			// If owner is not a combatant AND no one else is currently occupying it, stabilize it
			if (!combatantIds.has(ownerId) && Math.abs(occupationMap[i]) < 0.01) {
				landMask[i] = 1;
				clearCellInfluence(i);
				primaryOccupierMap[i] = 0;
			}
		}
	}

	// 5. Separate Peace Smoothing Pass - Optimized to avoid GC thrashing
	const smoothingPasses = 2;
	for (let p = 0; p < smoothingPasses; p++) {
		const tempMap = new Uint16Array(worldControlMap);
		const uniqueIds = new Int32Array(9);
		const idCounts = new Int32Array(9);

		for (let y = 1; y < gridHeight - 1; y++) {
			const rowIdx = y * gridWidth;
			for (let x = 1; x < gridWidth - 1; x++) {
				const i = rowIdx + x;
				if (landMask[i] !== 1) continue;

				uniqueIds.fill(0);
				idCounts.fill(0);
				let numUnique = 0;

				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						const nId = worldControlMap[i + dy * gridWidth + dx];
						if (nId > 0) {
							let found = false;
							for (let k = 0; k < numUnique; k++) {
								if (uniqueIds[k] === nId) {
									idCounts[k]++;
									found = true;
									break;
								}
							}
							if (!found && numUnique < 9) {
								uniqueIds[numUnique] = nId;
								idCounts[numUnique] = 1;
								numUnique++;
							}
						}
					}
				}

				let bestId = worldControlMap[i];
				let maxC = 0;
				for (let k = 0; k < numUnique; k++) {
					if (idCounts[k] > maxC) {
						maxC = idCounts[k];
						bestId = uniqueIds[k];
					}
				}
				if (maxC >= 5) tempMap[i] = bestId;
			}
		}
		worldControlMap.set(tempMap);
	}

	// 6. Update UI and check for total conflict end
	generateProvinces();
	recalculateAllBounds();
	updateSidesUI();
	influenceLayer.render();

	const activePoles = new Set();
	sides.forEach((side, idx) => {
		if (side.length > 0) activePoles.add(idx);
	});

	if (activePoles.size < 2) {
		applyTreaty("PEACE_TREATY");
	} else {
		playPeaceSound();
		gameState = "SIMULATING";
		statusText.innerText = `${target.name} signed separate peace. Conflict continues.`;
		cancelAnimationFrame(animationFrameId);
		requestAnimationFrame(updateLoop);
	}
}

export const SPEED_STEPS = [0.5, 1, 1.5, 3, 5];
export let currentSpeedIndex = 0; // Index for "0.1x"

export function togglePause() {
	isPaused = !isPaused;
	pauseBtn.innerText = isPaused ? "▶" : "⏸";
	pauseBtn.style.background = isPaused ? "#27ae60" : "#f39c12";
	statusText.innerText = isPaused
		? getTranslation("SIM_PAUSED")
		: ffaMode
			? getTranslation("STABLE")
			: getTranslation("STABLE");
}

pauseBtn.addEventListener("click", togglePause);

// Keybinds
document.addEventListener("keydown", (e) => {
	// Don't trigger if user is typing in an input or textarea
	if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

	if (e.code === "Space") {
		if (gameState === "SIMULATING") {
			e.preventDefault();
			togglePause();
		}
	}

	if (e.key === "Delete" || e.key === "Backspace") {
		if ((gameMode === "EDITOR" || godModeActive) && editingCountryId > 0) {
			e.preventDefault();
			unclaimSelectedCountry();
		}
	}

	// Z key: instantly zoom out to a global view of the entire world
	if (e.key === "z" || e.key === "Z") {
		e.preventDefault();
		// Fit the whole world into view with a small padding for aesthetics
		map.fitWorld({ animate: true, padding: [20, 20] });
	}

	if (e.key === "Escape") {
		if (gameState === "PEACE_SELECT_1" || gameState === "PEACE_SELECT_2") {
			e.preventDefault();
			gameState = "SIMULATING";
			statusText.innerText = "Conflict Continued";
			requestAnimationFrame(updateLoop);
		} else if (countryInspector.style.display === "block") {
			closeInspectorBtn.click();
		}
	}
});

export function unclaimSelectedCountry() {
	if (editingCountryId <= 0) return;

	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	const name = meta ? meta.name : "Nation";

	// Visual confirmation is good for destructive actions
	if (
		!confirm(
			`Satellite Directive: Are you sure you want to unclaim all territory for ${name}?`,
		)
	)
		return;

	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === editingCountryId) {
			worldControlMap[i] = 0;
		}
	}

	// Also remove from any active conflict sides
	sides.forEach((side) => {
		const idx = side.findIndex((c) => c.id === editingCountryId);
		if (idx > -1) side.splice(idx, 1);
	});

	updateSidesUI();
	countryInspector.style.display = "none";
	editingCountryId = -1;
	recalculateAllBounds();
	influenceLayer.render();
	statusText.innerText = `UNCLAIMED: ${name} territory has been returned to neutral status.`;
}

export function setSpeed(index) {
	currentSpeedIndex = Math.max(0, Math.min(index, SPEED_STEPS.length - 1));
	simSpeed = SPEED_STEPS[currentSpeedIndex];
	ffBtn.innerText = `${simSpeed}x`;
	if (simSpeed === 1) {
		ffBtn.classList.remove("active");
	} else {
		ffBtn.classList.add("active");
	}
	frameAccumulator = 0;
}

ffBtn.addEventListener("click", () => {
	const nextIndex = (currentSpeedIndex + 1) % SPEED_STEPS.length;
	setSpeed(nextIndex);
});

speedDownBtn.addEventListener("click", () => {
	setSpeed(currentSpeedIndex - 1);
});

speedUpBtn.addEventListener("click", () => {
	setSpeed(currentSpeedIndex + 1);
});

if (customTrackInput) {
	customTrackInput.addEventListener("change", async (e) => {
		const file = e.target.files[0];
		if (!file) return;

		loadingStatus.innerText = "Uploading Soundtrack...";
		loadingOverlay.style.display = "flex";

		try {
			const url = await websim.upload(file);
			customTrackUrl = url;
			setCookie("mw_custom_track", url);

			// Restart music with new track
			if (bgMusicSource) {
				bgMusicSource.stop();
				bgMusicSource = null;
			}
			initAudio();
			loadingOverlay.style.display = "none";
			alert("Custom soundtrack applied and saved!");
		} catch (err) {
			console.error(err);
			alert("Failed to upload soundtrack.");
			loadingOverlay.style.display = "none";
		}
	});
}

if (clearCustomTrackBtn) {
	clearCustomTrackBtn.addEventListener("click", () => {
		customTrackUrl = null;
		setCookie("mw_custom_track", "");
		if (customTrackInput) customTrackInput.value = "";

		if (bgMusicSource) {
			bgMusicSource.stop();
			bgMusicSource = null;
		}
		initAudio();
		alert("Soundtrack reset to original.");
	});
}

export async function initMultiplayer() {
	if (room) return;
	if (typeof WebsimSocket === "undefined") {
		console.warn(
			"Multiplayer disabled: WebsimSocket is unavailable in local server mode.",
		);
		return;
	}
	room = new WebsimSocket();
	await room.initialize();

	try {
		const currentUser = await window.websim.getCurrentUser();
		currentUsername = currentUser?.username || null;
	} catch (e) {
		console.warn("Failed to get current user for comments", e);
		currentUsername = null;
	}

	// Subscribe to persistent scenario records
	room.collection("scenario_v1").subscribe((scenarios) => {
		if (scenarioHubModal.style.display === "flex") {
			renderHub(scenarios);
		}
	});

	// Subscribe to persistent country records
	room.collection("country_library_v1").subscribe((countries) => {
		if (scenarioHubModal.style.display === "flex") {
			renderCountryLibrary(countries);
		}
	});

	// Subscribe to persistent flag records
	room.collection("flag_library_v1").subscribe((flags) => {
		if (scenarioHubModal.style.display === "flex") {
			renderFlagLibrary(flags);
		}
	});

	// Subscribe to comments so hub cards show live comment counts
	room.collection("hub_comment_v1").subscribe(() => {
		// Only bother re-rendering when the hub is visible
		if (scenarioHubModal.style.display === "flex") {
			const scenarios = room.collection("scenario_v1").getList();
			renderHub(scenarios || []);
		}
	});
}

tabScenariosBtn.onclick = () => switchHubTab("scenarios");
tabCountriesBtn.onclick = () => switchHubTab("countries");
tabFlagsBtn.onclick = () => switchHubTab("flags");

window.deleteScenario = async (id) => {
	if (!confirm("Are you sure you want to delete this scenario?")) return;
	try {
		await room.collection("scenario_v1").delete(id);
	} catch (e) {
		console.error(e);
		alert("Failed to delete scenario. You can only delete your own posts.");
	}
};

export function renderCountryLibrary(countries) {
	hubCountryCache = {};
	if (countries.length === 0) {
		libraryList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">Library is empty. Contribute your nations!</div>`;
		return;
	}

	const myUsername = currentUsername;
	const canImport = gameMode === "EDITOR" || godModeActive;

	libraryList.innerHTML = countries
		.map((c) => {
			hubCountryCache[c.id] = c;
			return `
        <div class="hub-item" data-item-type="country" data-item-id="${c.id}">
            <div style="height: 120px; position: relative; display: flex; align-items: center; justify-content: center; background: #000; border-bottom: 1px solid rgba(255,255,255,0.1); overflow: hidden;">
                 <img src="${c.previewUrl || "https://images.websim.ai/v1/projects/placeholder/landscape"}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.6;">
                 <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: radial-gradient(circle, transparent 30%, #000 100%);"></div>
                 <div style="position: absolute; display: flex; align-items: center; justify-content: center; z-index: 2;">
                    ${c.flagUrl ? `<img src="${c.flagUrl}" style="max-height: 40px; max-width: 60px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2);">` : '<span style="font-size: 30px;">🏳️</span>'}
                 </div>
                 <div style="position: absolute; bottom: 5px; left: 5px; right: 5px; height: 3px; background: ${c.color || "#fff"}; border-radius: 2px;"></div>
            </div>
            <div class="hub-content">
                <div class="hub-info">
                    <div class="hub-name">${c.name}</div>
                    <div class="hub-meta">
                        <img src="https://images.websim.com/avatar/${c.username}" class="hub-author-img">
                        <span>${c.username}</span>
                    </div>
                </div>
                <div class="hub-description">${c.description || "No description provided."}</div>
                <div class="hub-actions" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; gap: 5px;" class="hub-actions-buttons">
                        ${canImport ? `<button class="mini-btn" style="background: #27ae60; padding: 6px 12px;" onclick="event.stopPropagation(); window.importFromLibrary('${c.id}')">IMPORT</button>` : ""}
                        ${
													c.username === myUsername
														? `<button class="mini-btn" style="background: #c0392b; padding: 6px 12px;" onclick="window.deleteCountry('${c.id}')">DEL</button>`
														: ""
												}
                    </div>
                    <span style="font-size: 10px; color: #555;">${new Date(c.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    `;
		})
		.join("");

	libraryList.querySelectorAll(".hub-item").forEach((card) => {
		if (card.dataset.boundClick) return;
		card.dataset.boundClick = "1";
		card.addEventListener("click", (ev) => {
			if (
				ev.target.closest(".hub-actions-buttons") ||
				ev.target.closest("button")
			)
				return;
			const id = card.getAttribute("data-item-id");
			if (!id) return;
			const item = hubCountryCache[id];
			if (!item) return;
			openItemModal("country", item);
		});
	});
}

export function renderFlagLibrary(flags) {
	hubFlagCache = {};
	if (flags.length === 0) {
		flagLibraryList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">No custom flags shared yet. Be the first!</div>`;
		return;
	}

	const myUsername = currentUsername;
	const canImport = gameMode === "EDITOR" || godModeActive;

	flagLibraryList.innerHTML = flags
		.map((f) => {
			hubFlagCache[f.id] = f;
			return `
        <div class="hub-item" data-item-type="flag" data-item-id="${f.id}">
            <div style="height: 100px; display: flex; align-items: center; justify-content: center; background: #000; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 15px;">
                 <img src="${f.flagUrl}" style="max-height: 100%; max-width: 100%; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2);">
            </div>
            <div class="hub-content">
                <div class="hub-info">
                    <div class="hub-name">${f.name}</div>
                    <div class="hub-meta">
                        <img src="https://images.websim.com/avatar/${f.username}" class="hub-author-img">
                        <span>${f.username}</span>
                    </div>
                </div>
                <div class="hub-description">${f.description || "No description."}</div>
                <div class="hub-actions" style="margin-top: auto; display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; gap: 5px;" class="hub-actions-buttons">
                        ${canImport ? `<button class="mini-btn" style="background: #2e86de; padding: 6px 12px;" onclick="event.stopPropagation(); window.importFlagFromLibrary('${f.id}')">USE</button>` : ""}
                        ${
													f.username === myUsername
														? `<button class="mini-btn" style="background: #c0392b; padding: 6px 12px;" onclick="window.deleteFlag('${f.id}')">DEL</button>`
														: ""
												}
                    </div>
                </div>
            </div>
        </div>
    `;
		})
		.join("");

	flagLibraryList.querySelectorAll(".hub-item").forEach((card) => {
		if (card.dataset.boundClick) return;
		card.dataset.boundClick = "1";
		card.addEventListener("click", (ev) => {
			if (
				ev.target.closest(".hub-actions-buttons") ||
				ev.target.closest("button")
			)
				return;
			const id = card.getAttribute("data-item-id");
			if (!id) return;
			const item = hubFlagCache[id];
			if (!item) return;
			openItemModal("flag", item);
		});
	});
}

window.deleteFlag = async (id) => {
	if (!confirm("Remove this flag from the library?")) return;
	try {
		await room.collection("flag_library_v1").delete(id);
	} catch (e) {
		console.error(e);
		alert("Delete failed.");
	}
};

/**
 * GLOBAL EXPORTS FOR HUB INTERACTION
 */
window.importFlagFromLibrary = async (id) => {
	// Robust lookup to ensure we have the data
	const list = room.collection("flag_library_v1").getList();
	const flagData = list.find((f) => f.id === id);

	if (!flagData || editingCountryId <= 0) {
		if (editingCountryId <= 0) {
			alert(
				"SATELLITE INTERFACE: You must select a nation on the map first to designate a target for the new national identity.",
			);
		} else {
			alert(
				"SATELLITE ERROR: Could not retrieve flag data from the hub archives.",
			);
		}
		return;
	}

	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	if (meta) {
		updateCountryFlag(editingCountryId, flagData.flagUrl);
		closeHub();
		// Visual confirmation
		statusText.innerText = `IDENTIFIED: ${meta.name} now using community flag '${flagData.name}'`;
	}
};

export function saveCountryLocally(countryId) {
	const meta = countryMetadata.find((m) => m && m.id === countryId);
	if (!meta) return;

	const countryData = {
		id: meta.id,
		name: meta.name,
		color: meta.color,
		flagUrl: meta.flagUrl,
		isCustom: meta.isCustom || false,
		role: meta.role || "OFFENSE",
		overlordId: meta.overlordId || null,
	};

	const cells = [];
	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === countryId) {
			const y = Math.floor(i / gridWidth);
			const x = i % gridWidth;
			cells.push([x, y]);
		}
	}

	// Cache cells on metadata so releasables and multi-export can reuse them
	meta.savedCells = cells;

	const presetData = {
		name: `${meta.name}_country`,
		metadata: countryData,
		cells: cells,
		gridRes: CONFIG.GRID_RES,
		version: "1.0",
	};

	const blob = new Blob([JSON.stringify(presetData)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${meta.name.replace(/\s+/g, "_")}_country.json`;
	a.click();
	URL.revokeObjectURL(url);

	statusText.innerText = `SAVED: ${meta.name} exported locally`;
}

export function loadCountryFromPC() {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json";
	input.onchange = async (e) => {
		const file = e.target.files[0];
		if (!file) return;

		loadingStatus.innerText = "Loading Country Data...";
		loadingOverlay.style.display = "flex";

		try {
			const text = await file.text();
			const data = JSON.parse(text);

			if (!data.metadata || !data.cells) {
				throw new Error("Invalid country file structure");
			}

			const currentRes = CONFIG.GRID_RES;
			const sourceRes = data.gridRes || currentRes;

			// Find next available country ID
			const maxId = countryMetadata.reduce(
				(max, m) => (m ? Math.max(max, m.id) : max),
				0,
			);
			const newId = maxId + 1;

			// Create metadata entry
			const meta = {
				id: newId,
				name: data.metadata.name || "Imported Nation",
				color: data.metadata.color || "rgba(150, 150, 150, 0.5)",
				rgba: parseColorToRGBA(
					data.metadata.color || "rgba(150, 150, 150, 0.5)",
				),
				isCustom: true,
				flagUrl: data.metadata.flagUrl || null,
				role: data.metadata.role || "OFFENSE",
				overlordId: data.metadata.overlordId || null,
				bounds: {
					minX: Infinity,
					maxX: -Infinity,
					minY: Infinity,
					maxY: -Infinity,
				},
			};

			if (meta.flagUrl) {
				meta.tempFlag = new Image();
				meta.tempFlag.crossOrigin = "anonymous";
				meta.tempFlag.src = meta.flagUrl;
			}

			countryMetadata[newId - 1] = meta;

			// Place cells on map with resolution conversion if needed
			for (const [sx, sy] of data.cells) {
				if (sourceRes === currentRes) {
					const idx = sy * gridWidth + sx;
					if (idx < worldControlMap.length) {
						worldControlMap[idx] = newId;
						provinceMap[idx] = getProvinceId(sx, sy, newId);
						if (landMask[idx] === 0) landMask[idx] = 1;

						// Update bounds
						meta.bounds.minX = Math.min(meta.bounds.minX, sx);
						meta.bounds.maxX = Math.max(meta.bounds.maxX, sx);
						meta.bounds.minY = Math.min(meta.bounds.minY, sy);
						meta.bounds.maxY = Math.max(meta.bounds.maxY, sy);
					}
				} else {
					// Convert coordinates
					const baseLat = sy * sourceRes - 90;
					const baseLng = sx * sourceRes - 180;

					if (sourceRes > currentRes) {
						for (
							let lat = baseLat;
							lat < baseLat + sourceRes;
							lat += currentRes
						) {
							for (
								let lng = baseLng;
								lng < baseLng + sourceRes;
								lng += currentRes
							) {
								const tIdx = getGridIndex(
									lat + currentRes / 2,
									lng + currentRes / 2,
								);
								if (tIdx !== -1) {
									worldControlMap[tIdx] = newId;
									provinceMap[tIdx] = getProvinceId(
										Math.floor((lng + currentRes / 2 + 180) / currentRes),
										Math.floor((lat + currentRes / 2 + 90) / currentRes),
										newId,
									);
									if (landMask[tIdx] === 0) landMask[tIdx] = 1;
								}
							}
						}
					} else {
						const tIdx = getGridIndex(
							baseLat + sourceRes / 2,
							baseLng + sourceRes / 2,
						);
						if (tIdx !== -1) {
							worldControlMap[tIdx] = newId;
							const tx = Math.floor(
								(baseLng + sourceRes / 2 + 180) / currentRes,
							);
							const ty = Math.floor(
								(baseLat + sourceRes / 2 + 90) / currentRes,
							);
							provinceMap[tIdx] = getProvinceId(tx, ty, newId);
							if (landMask[tIdx] === 0) landMask[tIdx] = 1;

							// Update bounds
							meta.bounds.minX = Math.min(meta.bounds.minX, tx);
							meta.bounds.maxX = Math.max(meta.bounds.maxX, tx);
							meta.bounds.minY = Math.min(meta.bounds.minY, ty);
							meta.bounds.maxY = Math.max(meta.bounds.maxY, ty);
						}
					}
				}
			}

			loadingOverlay.style.display = "none";

			// Check if bounds were updated, if not set reasonable defaults
			if (meta.bounds.minX === Infinity) {
				meta.bounds = {
					minX: 0,
					maxX: gridWidth - 1,
					minY: 0,
					maxY: gridHeight - 1,
				};
			}

			openInspector(newId);
			statusText.innerText = `IMPORTED: ${meta.name} from local file`;
			influenceLayer.render();
		} catch (err) {
			console.error("Country import error:", err);
			alert(`Failed to import country: ${err.message}`);
			loadingOverlay.style.display = "none";
		}
	};
	input.click();
}

window.deleteCountry = async (id) => {
	if (
		!confirm("Are you sure you want to delete this country from the library?")
	)
		return;
	try {
		await room.collection("country_library_v1").delete(id);
	} catch (e) {
		console.error(e);
		alert("Failed to delete.");
	}
};

window.importFromLibrary = async (id) => {
	const list = room.collection("country_library_v1").getList();
	const countryData = list.find((c) => c.id === id);
	if (!countryData) return;

	loadingStatus.innerText = `Importing ${countryData.name}...`;
	loadingOverlay.style.display = "flex";
	closeHub();

	// Allow UI to update
	await new Promise((r) => setTimeout(r, 100));

	try {
		const newId = countryMetadata.length + 1;
		const newMeta = {
			id: newId,
			name: countryData.name,
			color: countryData.color,
			rgba: parseColorToRGBA(countryData.color),
			isCustom: true,
			flagUrl: countryData.flagUrl,
		};
		countryMetadata.push(newMeta);

		// Fetch cells from URL if they aren't in the record (new format to avoid 250KB limit)
		let cells = countryData.cells;
		if (!cells && countryData.cellsUrl) {
			try {
				const resp = await fetch(countryData.cellsUrl);
				cells = await resp.json();
			} catch (e) {
				console.error("Failed to fetch country cells", e);
				alert("Error importing country geography.");
				loadingOverlay.style.display = "none";
				return;
			}
		}

		if (!cells) {
			alert("This country has no geography data.");
			loadingOverlay.style.display = "none";
			return;
		}

		// Map relative cells to current grid
		const sourceRes = countryData.gridRes || CONFIG.GRID_RES;
		const targetRes = CONFIG.GRID_RES;

		cells.forEach(([cx, cy]) => {
			// Robust conversion: Fill all target cells that overlap with the source cell
			const baseLat = cy * sourceRes - 90;
			const baseLng = cx * sourceRes - 180;

			const xStart = Math.floor((baseLng + 180) / targetRes);
			const xEnd = Math.floor((baseLng + sourceRes + 180 - 0.0001) / targetRes);
			const yStart = Math.floor((baseLat + 90) / targetRes);
			const yEnd = Math.floor((baseLat + sourceRes + 90 - 0.0001) / targetRes);

			for (let ty = yStart; ty <= yEnd; ty++) {
				if (ty < 0 || ty >= gridHeight) continue;
				const rowOffset = ty * gridWidth;
				for (let tx = xStart; tx <= xEnd; tx++) {
					if (tx < 0 || tx >= gridWidth) continue;
					const tIdx = rowOffset + tx;
					worldControlMap[tIdx] = newId;
					if (landMask[tIdx] === 0) landMask[tIdx] = 1;
				}
			}
		});

		recalculateAllBounds();
		loadingOverlay.style.display = "none";
		influenceLayer.render();
		alert(`${countryData.name} imported successfully!`);
	} catch (e) {
		console.error(e);
		alert("Import failed.");
		loadingOverlay.style.display = "none";
	}
};

window.playFromHub = async (url, id, name, ownerUsername) => {
	initAudio();
	setLoadingThematic(true);
	loadingStatus.innerText = "Downloading Scenario...";
	loadingOverlay.style.display = "flex";
	scenarioHubModal.style.display = "none";

	const currentUser = await window.websim.getCurrentUser();
	const myUsername = currentUser.username;

	try {
		const response = await fetch(url);
		if (!response.ok) throw new Error("Failed to fetch");
		const blob = await response.blob();

		currentScenarioContext = { id, name, ownerUsername, blobUrl: url };
		activeScenarioId = ownerUsername === myUsername ? id : null;

		await performPresetLoad(blob, "CONQUEST");

		if (activeScenarioId) {
			editorUpdateBtn.style.display = "block";
		} else {
			editorUpdateBtn.style.display = "none";
		}
	} catch (e) {
		console.error(e);
		alert("Failed to download scenario.");
		loadingOverlay.style.display = "none";
	}
};

window.remixFromHub = async (url, sourceId, sourceName, ownerUsername) => {
	initAudio();
	setLoadingThematic(true);
	loadingStatus.innerText = "Downloading for Remix...";
	loadingOverlay.style.display = "flex";
	scenarioHubModal.style.display = "none";

	const currentUser = await window.websim.getCurrentUser();
	const myUsername = currentUser.username;

	try {
		const response = await fetch(url);
		if (!response.ok) throw new Error("Failed to fetch");
		const blob = await response.blob();
		await performPresetLoad(blob, "EDITOR");

		currentScenarioContext = {
			id: sourceId,
			name: sourceName,
			ownerUsername,
			blobUrl: url,
		};
		statusText.innerText = `REMIXING: ${sourceName}`;

		// If we remix our OWN work, allow updating it
		activeScenarioId = ownerUsername === myUsername ? sourceId : null;
		if (activeScenarioId) {
			editorUpdateBtn.style.display = "block";
		} else {
			editorUpdateBtn.style.display = "none";
		}
	} catch (e) {
		console.error(e);
		alert("Failed to download scenario for remix.");
		loadingOverlay.style.display = "none";
	}
};

/**
 * PRELOAD CORE VISUAL ASSETS
 * Caches large menu backgrounds and thematic overlays to prevent flickering during transitions.
 */
export function preloadAssets() {
	const assets = [
		"assets/images/2022.webp",
		"assets/images/1974.webp",
		"assets/images/1942.webp",
		"assets/images/1936.webp",
		"assets/images/1914.webp",
		"assets/images/1804.webp",
		"assets/images/1492.webp",
	];
	assets.forEach((src) => {
		const img = new Image();
		img.src = src;
	});
}

// Initial preload trigger
preloadAssets();

// Initialization logic
export function initializeEngine() {
	const gridRes = parseFloat(document.getElementById("grid-res-select").value);
	const unitLimit = parseInt(
		document.getElementById("unit-limit-select").value,
		10,
	);

	// Sync global toggles from both main settings and setup panel sources
	const mtDisabled =
		document.getElementById("disable-mountains-checkbox").checked ||
		document.getElementById("setup-disable-mountains-checkbox").checked;
	mountainsEnabled = !mtDisabled;

	const provDisabled =
		document.getElementById("disable-provinces-checkbox").checked ||
		document.getElementById("setup-disable-provinces-checkbox").checked;
	_provincesEnabled = !provDisabled;

	showUnitsVisually = !document.getElementById(
		"disable-units-visually-checkbox",
	).checked;
	disableCountryGradient = !!document.getElementById(
		"disable-country-gradient-checkbox",
	)?.checked;

	// Check if configuration changed enough to require re-allocation
	if (CONFIG.GRID_RES !== gridRes || !worldControlMap) {
		CONFIG.GRID_RES = gridRes;
		CONFIG.MAX_UNITS_PER_SIDE = unitLimit;

		// Allocate Grid
		gridWidth = Math.ceil(360 / CONFIG.GRID_RES);
		gridHeight = Math.ceil(180 / CONFIG.GRID_RES);
		worldControlMap = new Uint16Array(gridWidth * gridHeight);
		deJureMap = new Uint16Array(gridWidth * gridHeight);
		provinceMap = new Int32Array(gridWidth * gridHeight);
		occupationMap = new Float32Array(gridWidth * gridHeight);
		initSideInfluenceMaps();
		primaryOccupierMap = new Uint16Array(gridWidth * gridHeight);
		landMask = new Uint8Array(gridWidth * gridHeight);
		biomeMask = new Uint8Array(gridWidth * gridHeight);
		terrainMask = new Float32Array(gridWidth * gridHeight);
		flagProcessedBuffer = new Int32Array(gridWidth * gridHeight);

		// If we are already in a mode that has geography loaded, we should refresh it
		if (rawGeoJsonData) {
			const isBlank = gameMode === "EDITOR";
			updateLandMask(rawGeoJsonData.features, 1, isBlank);
		}
	} else {
		CONFIG.MAX_UNITS_PER_SIDE = unitLimit;
	}
}

musicVolumeSlider.addEventListener("input", (e) => {
	const vol = parseFloat(e.target.value);
	musicVolVal.innerText = `${Math.round(vol * 100)}%`;
	if (bgMusicGain && !isMuted) {
		bgMusicGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.05);
	}
	setCookie("mw_music_vol", vol);
});

muteBtn.addEventListener("click", () => {
	isMuted = !isMuted;
	muteBtn.innerText = isMuted ? "🔇" : "🔊";

	if (!audioCtx) return;

	if (isMuted) {
		if (bgMusicGain)
			bgMusicGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
		if (warAmbianceGain)
			warAmbianceGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
	} else {
		const savedVol = getCookie("mw_music_vol");
		const musicVol = savedVol !== "" ? parseFloat(savedVol) : 0.15;
		if (bgMusicGain)
			bgMusicGain.gain.setTargetAtTime(musicVol, audioCtx.currentTime, 0.1);
		if (warAmbianceGain && gameState === "SIMULATING") {
			warAmbianceGain.gain.setTargetAtTime(0.05, audioCtx.currentTime, 0.1);
		}
	}
});

presetLowBtn.addEventListener("click", () => {
	mapResSelect.value = "110m";
	gridResSelect.value = "0.15";
	unitLimitSelect.value = "100";

	// Switch to Simplified mode without gradients for low performance
	setImageryProvider("wargames");
	if (disableCountryGradientCheckbox) {
		disableCountryGradientCheckbox.checked = true;
		disableCountryGradient = true;
	}

	document.getElementById("disable-mountains-checkbox").checked = true;
	setupDisableMountainsCheckbox.checked = true;
	mountainsEnabled = false;

	// Visual feedback
	presetLowBtn.style.boxShadow = "0 0 15px rgba(192, 57, 43, 0.5)";
	presetDefaultBtn.style.boxShadow = "none";
});

presetDefaultBtn.addEventListener("click", () => {
	mapResSelect.value = "110m";
	gridResSelect.value = "0.1";
	unitLimitSelect.value = "250";

	// Reset to Google Earth with gradients for default
	setImageryProvider("google");
	if (disableCountryGradientCheckbox) {
		disableCountryGradientCheckbox.checked = false;
		disableCountryGradient = false;
	}

	document.getElementById("disable-mountains-checkbox").checked = false;
	setupDisableMountainsCheckbox.checked = false;
	mountainsEnabled = true;

	// Visual feedback
	presetDefaultBtn.style.boxShadow = "0 0 15px rgba(46, 134, 222, 0.5)";
	presetLowBtn.style.boxShadow = "none";
});

launchBtn.addEventListener("click", () => {
	initAudio();
	initMultiplayer();
	initializeEngine();

	if (saveSkipCheckbox.checked) {
		setCookie("mw_skip_settings", "true");
		setCookie("mw_map_res", mapResSelect.value);
		setCookie("mw_grid_res", gridResSelect.value);
		setCookie("mw_unit_limit", unitLimitSelect.value);
		setCookie(
			"mw_disable_mountains",
			document.getElementById("disable-mountains-checkbox").checked
				? "true"
				: "false",
		);
		setCookie(
			"mw_disable_provinces",
			document.getElementById("disable-provinces-checkbox").checked
				? "true"
				: "false",
		);
		setCookie(
			"mw_disable_units_visually",
			document.getElementById("disable-units-visually-checkbox").checked
				? "true"
				: "false",
		);
		setCookie(
			"mw_disable_country_gradient",
			disableCountryGradientCheckbox.checked ? "true" : "false",
		);
		if (disableInvisibleBuffsCheckbox) {
			setCookie(
				"mw_disable_invis_buffs",
				disableInvisibleBuffsCheckbox.checked ? "true" : "false",
			);
		}
		if (disableAutoFullscreenCheckbox) {
			setCookie(
				"mw_disable_fullscreen",
				disableAutoFullscreenCheckbox.checked ? "true" : "false",
			);
		}
		if (useSystemFontCheckbox) {
			setCookie(
				"mw_use_system_font",
				useSystemFontCheckbox.checked ? "true" : "false",
			);
		}
	} else {
		setCookie("mw_skip_settings", "false");
	}

	settingsOverlay.style.display = "none";
	if (gameState === "MAIN_MENU") {
		mainMenu.style.display = "flex";
	} else {
		mapUi.style.display = "flex";
		mapUi.style.display = "flex";
		if (currentScenarioContext && gameMode === "EDITOR") {
			statusText.innerText = `REMIXING: ${currentScenarioContext.name}`;
		} else if (currentScenarioContext && gameMode === "CONQUEST") {
			statusText.innerText = `PLAYING: ${currentScenarioContext.name}`;
		}
	}
	launchBtn.innerText = "Apply Changes"; // Change for subsequent opens
});

// Auto-load settings on boot
export function checkAutoLaunch() {
	// Attempt to initialize audio context immediately on load (though it may be blocked until a click)
	initAudio();

	if (getCookie("mw_skip_settings") === "true") {
		mapResSelect.value = getCookie("mw_map_res") || "50m";
		gridResSelect.value = getCookie("mw_grid_res") || "0.15";
		unitLimitSelect.value = getCookie("mw_unit_limit") || "500";
		const mtSaved = getCookie("mw_disable_mountains");
		if (mtSaved === "true") {
			document.getElementById("disable-mountains-checkbox").checked = true;
			setupDisableMountainsCheckbox.checked = true;
			mountainsEnabled = false;
		} else {
			document.getElementById("disable-mountains-checkbox").checked = false;
			setupDisableMountainsCheckbox.checked = false;
			mountainsEnabled = true;
		}

		const provSaved = getCookie("mw_disable_provinces");
		if (provSaved === "false") {
			mainDisableProvincesCheckbox.checked = false;
			setupDisableProvincesCheckbox.checked = false;
			_provincesEnabled = true;
		} else {
			// Default to disabled (checked) if 'true' or not yet set
			mainDisableProvincesCheckbox.checked = true;
			setupDisableProvincesCheckbox.checked = true;
			_provincesEnabled = false;
		}

		const unitsVisSaved = getCookie("mw_disable_units_visually");
		if (unitsVisSaved === "true") {
			document.getElementById("disable-units-visually-checkbox").checked = true;
			showUnitsVisually = false;
		} else {
			document.getElementById("disable-units-visually-checkbox").checked =
				false;
			showUnitsVisually = true;
		}

		const gradSaved = getCookie("mw_disable_country_gradient");
		if (gradSaved === "true") {
			disableCountryGradientCheckbox.checked = true;
			disableCountryGradient = true;
		} else {
			disableCountryGradientCheckbox.checked = false;
			disableCountryGradient = false;
		}

		const invisSaved = getCookie("mw_disable_invis_buffs");
		if (disableInvisibleBuffsCheckbox) {
			disableInvisibleBuffsCheckbox.checked = invisSaved === "true";
		}
		invisibleBuffsEnabled = invisSaved !== "true";

		const fullscreenSaved = getCookie("mw_disable_fullscreen");
		if (disableAutoFullscreenCheckbox) {
			disableAutoFullscreenCheckbox.checked = fullscreenSaved === "true";
		}
		disableFullscreen = fullscreenSaved === "true";

		const systemFontSaved = getCookie("mw_use_system_font");
		if (useSystemFontCheckbox) {
			useSystemFontCheckbox.checked = systemFontSaved === "true";
			if (systemFontSaved === "true") {
				document.body.classList.add("use-system-font");
			} else {
				document.body.classList.remove("use-system-font");
			}
		}

		saveSkipCheckbox.checked = true;

		initMultiplayer();
		initializeEngine();

		settingsOverlay.style.display = "none";
		mainMenu.style.display = "flex";
		gameState = "MAIN_MENU";
		launchBtn.innerText = "Apply Changes";
		// Ensure background music is running as soon as the main menu is shown
		initAudio();

		if (getCookie("mw_tutorial_finished") !== "true") {
			startTutorial(conquestTutorialSteps, "mw_tutorial_finished");
		}
	} else {
		// Fix: If not auto-launching, we must show the settings overlay so the user can initialize the engine.
		settingsOverlay.style.display = "flex";
	}
}

// Settings Tab Logic
document.querySelectorAll(".settings-tab-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		const tab = btn.dataset.tab;
		// Buttons UI
		document.querySelectorAll(".settings-tab-btn").forEach((b) => {
			b.classList.remove("active");
		});
		btn.classList.add("active");
		// Panes UI
		document.querySelectorAll(".settings-tab-pane").forEach((pane) => {
			pane.style.display = "none";
		});
		const target = document.getElementById(`settings-tab-${tab}`);
		if (target) target.style.display = "block";
	});
});

if (disableCountryGradientCheckbox) {
	disableCountryGradientCheckbox.addEventListener("change", (e) => {
		disableCountryGradient = e.target.checked;
		setCookie(
			"mw_disable_country_gradient",
			e.target.checked ? "true" : "false",
		);
		influenceLayer.render();
	});
}

// Global invisible buffs toggle wiring
if (disableInvisibleBuffsCheckbox) {
	// Initialize from current global state
	disableInvisibleBuffsCheckbox.checked = !invisibleBuffsEnabled;
	disableInvisibleBuffsCheckbox.addEventListener("change", (e) => {
		// When checked, invisible buffs are turned off
		invisibleBuffsEnabled = !e.target.checked;
		setCookie("mw_disable_invis_buffs", e.target.checked ? "true" : "false");
		// Force a re-render so combat previews / UI respond immediately
		influenceLayer.render();
	});
}

checkAutoLaunch();
// Initial language application must happen after all DOM is ready and checkAutoLaunch is done
applyLanguage();
updateRestartVisibility();

// Initialize editor tools page if toolbox exists
if (editorToolbox) {
	updateEditorToolPage(1);
}

mainSettingsBtn.addEventListener("click", () => {
	settingsOverlay.style.display = "flex";
	mainMenu.style.display = "none";
});

if (benchmarkBtn) {
	benchmarkBtn.addEventListener("click", () => {
		mainMenu.style.display = "none";
		settingsOverlay.style.display = "none";
		startBenchmark();
	});
}

if (benchmarkDismissBtn) {
	benchmarkDismissBtn.addEventListener("click", () => {
		if (benchmarkResults) benchmarkResults.style.display = "none";
		isPaused = false;
	});
}

ingameSettingsBtn.addEventListener("click", () => {
	settingsOverlay.style.display = "flex";
	mapUi.style.display = "none";
});

export const closeSettingsBtn = document.getElementById("close-settings-btn");
if (closeSettingsBtn) {
	closeSettingsBtn.addEventListener("click", () => {
		settingsOverlay.style.display = "none";
		if (gameState === "MAIN_MENU") {
			mainMenu.style.display = "flex";
		} else {
			mapUi.style.display = "flex";
		}
	});
}

playModeBtn.addEventListener("click", () => {
	const navMain = document.getElementById("nav-links-container");
	const selector = document.getElementById("menu-scenario-selector");

	navMain.classList.add("hidden");
	setTimeout(() => {
		navMain.style.display = "none";
		selector.style.display = "flex";
	}, 500);
});

document.getElementById("back-to-nav-btn").addEventListener("click", () => {
	const navMain = document.getElementById("nav-links-container");
	const selector = document.getElementById("menu-scenario-selector");

	selector.style.opacity = "0";
	selector.style.transform = "translateX(50px)";

	setTimeout(() => {
		selector.style.display = "none";
		selector.style.opacity = "1";
		selector.style.transform = "none";
		navMain.style.display = "flex";
		setTimeout(() => navMain.classList.remove("hidden"), 10);
	}, 400);
});

/**
 * DYNAMIC MENU BACKGROUND SYSTEM
 */


export let queuedScenarioAction = null;
export const enterScenarioBtn = document.getElementById("enter-scenario-btn");

enterScenarioBtn.onclick = () => {
	if (queuedScenarioAction) {
		queuedScenarioAction();
	}
};

// Wire Scroller Cards
document.getElementById("scroller-choice-modern").onclick = () =>
	selectScenario("scroller-choice-modern", () => choiceModernDay.click());
document.getElementById("scroller-choice-1936").onclick = () =>
	selectScenario("scroller-choice-1936", () => choice1936Scenario.click());
document.getElementById("scroller-choice-1914").onclick = () =>
	selectScenario("scroller-choice-1914", () => choiceWW1Scenario.click());

// Enable double-click to launch scenarios immediately
document.querySelectorAll(".scroller-card").forEach((card) => {
	card.addEventListener("dblclick", () => {
		// Trigger the select first to ensure queuedScenarioAction is set, then execute
		card.click();
		if (queuedScenarioAction) {
			queuedScenarioAction();
		}
	});
});

choiceModernDay.onclick = async () => {
	// Smooth transition from Selector to Loading within the menu
	const selector = document.getElementById("menu-scenario-selector");
	if (selector) {
		selector.style.opacity = "0";
		selector.style.transform = "translateX(50px)";
		selector.style.transition = "all 0.4s ease";
	}

	initAudio();
	setLoadingThematic(true);
	loadingStatus.innerText = "Loading Modern World Theater...";
	loadingOverlay.style.display = "flex";

	try {
		const url = "assets/maps/world map 2022.json";
		const response = await fetch(url);
		if (!response.ok) throw new Error("Failed to fetch modern map");
		const blob = await response.blob();

		currentScenarioContext = {
			id: "world_map_2022",
			name: "Modern Day",
			ownerUsername: "System",
			blobUrl: url,
		};
		activeScenarioId = null;

		await performPresetLoad(blob, "CONQUEST");
		mainMenu.style.display = "none";
	} catch (e) {
		console.error(e);
		// Fallback to old method if preset fails
		gameMode = "CONQUEST";
		gameState = "SELECTING_P1";
		const mapRes = document.getElementById("map-res-select").value;
		const geoUrl = `${CONFIG.GEOJSON_BASE}${mapRes}/cultural/ne_${mapRes}_admin_0_countries.json`;
		mainMenu.style.display = "none";
		loadCountries(geoUrl, false);
	}
};

choice1936Scenario.onclick = async () => {
	const selector = document.getElementById("menu-scenario-selector");
	if (selector) {
		selector.style.opacity = "0";
		selector.style.transform = "translateX(50px)";
		selector.style.transition = "all 0.4s ease";
	}
	initAudio();
	setLoadingThematic(true);
	loadingStatus.innerText = "Loading WW2 Peru Update...";
	loadingOverlay.style.display = "flex";

	try {
		const url = "assets/maps/WW2 Peru Update.json";
		const response = await fetch(url);
		if (!response.ok) throw new Error("Failed to fetch WW2 Peru Update");
		const blob = await response.blob();

		currentScenarioContext = {
			id: "ww2_peru_update",
			name: "WW2 Peru Update",
			ownerUsername: "System",
			blobUrl: url,
		};
		activeScenarioId = null;

		await performPresetLoad(blob, "CONQUEST");
		mainMenu.style.display = "none";
	} catch (e) {
		console.error(e);
		alert("Failed to load WW2 Peru Update scenario.");
		loadingOverlay.style.display = "none";
	}
};

choiceWW1Scenario.onclick = async () => {
	const selector = document.getElementById("menu-scenario-selector");
	if (selector) {
		selector.style.opacity = "0";
		selector.style.transform = "translateX(50px)";
		selector.style.transition = "all 0.4s ease";
	}
	initAudio();
	setLoadingThematic(true);
	loadingStatus.innerText = "Loading 1914 Theater...";
	loadingOverlay.style.display = "flex";

	try {
		const url = "assets/maps/world_war_1__1914_.json";
		const response = await fetch(url);
		if (!response.ok) throw new Error("Failed to fetch 1914 map");
		const blob = await response.blob();

		currentScenarioContext = {
			id: "ww1_1914",
			name: "1914 Scenario",
			ownerUsername: "System",
			blobUrl: url,
		};
		activeScenarioId = null;

		await performPresetLoad(blob, "CONQUEST");
		mainMenu.style.display = "none";
	} catch (e) {
		console.error(e);
		alert("Failed to load 1914 scenario.");
		loadingOverlay.style.display = "none";
	}
};

cancelConquestChoice.onclick = () => {
	conquestChoiceModal.style.display = "none";
};

/**
 * EDITOR LOGIC
 */
export function openReleaseModal(releaserId, sideIdx) {
	const releasables = countryMetadata.filter(
		(m) => m && m.releasableBy === releaserId,
	);
	if (releasables.length === 0) return;

	releasableListContainer.innerHTML = releasables
		.map(
			(m) => `
        <button class="menu-card" style="padding: 10px; width: 100%; text-align: left;" onclick="window.releaseNation(${m.id}, ${releaserId}, ${sideIdx})">
            <img src="${m.flagUrl || ""}" style="width: 30px; height: 18px; object-fit: cover; border: 1px solid #444; margin-right: 10px;">
            <div class="card-body">
                <span class="btn-text" style="font-size: 12px;">${m.name}</span>
            </div>
        </button>
    `,
		)
		.join("");

	releaseModal.style.display = "flex";
}

closeReleaseModalBtn.onclick = () => {
	releaseModal.style.display = "none";
};

window.releaseNation = async (nationId, releaserId, sideIdx) => {
	const meta = countryMetadata.find((m) => m && m.id === nationId);
	if (!meta) return;

	// Clear releasable flag so this entry doesn’t show again until re‑set
	meta.releasableBy = null;

	const isWar = gameState === "SIMULATING";

	loadingStatus.innerText = `RESTORING NATION: ${meta.name}...`;
	loadingOverlay.style.display = "flex";
	await new Promise((r) => setTimeout(r, 50));

	// Decide which cell list to use for restoration:
	// 1) explicit savedCells from when it was marked releasable
	// 2) deJure cores
	// 3) rasterized from GeoJSON feature (slowest; last resort)
	let cellList =
		Array.isArray(meta.savedCells) && meta.savedCells.length
			? meta.savedCells
			: null;

	if (!cellList && deJureMap) {
		const cells = [];
		for (let i = 0; i < deJureMap.length; i++) {
			if (deJureMap[i] === nationId) {
				const y = Math.floor(i / gridWidth);
				const x = i % gridWidth;
				cells.push([x, y]);
			}
		}
		if (cells.length) cellList = cells;
	}

	if (!cellList && meta.feature) {
		const bounds = L.geoJSON(meta.feature).getBounds();
		const res = CONFIG.GRID_RES;
		const sLat = Math.max(0, Math.floor((bounds.getSouth() + 90) / res));
		const eLat = Math.min(
			gridHeight - 1,
			Math.ceil((bounds.getNorth() + 90) / res),
		);
		const sLng = Math.max(0, Math.floor((bounds.getWest() + 180) / res));
		const eLng = Math.min(
			gridWidth - 1,
			Math.ceil((bounds.getEast() + 180) / res),
		);
		const cells = [];
		for (let y = sLat; y <= eLat; y++) {
			for (let x = sLng; x <= eLng; x++) {
				const lat = y * res - 90 + res * 0.5;
				const lng = x * res - 180 + res * 0.5;
				if (isPointInFeature(lat, lng, meta.feature)) {
					cells.push([x, y]);
				}
			}
		}
		if (cells.length) cellList = cells;
	}

	let restoredAny = false;
	// If this nation came from a preset with savedCells, we can safely override any current owner on those cells.
	const hasExplicitSavedCells =
		Array.isArray(meta.savedCells) && meta.savedCells.length > 0;

	if (cellList?.length) {
		for (let i = 0; i < cellList.length; i++) {
			const [x, y] = cellList[i];
			const idx = y * gridWidth + x;
			if (idx < 0 || idx >= worldControlMap.length) continue;

			const currentOwner = worldControlMap[idx];

			// Only restrict to releaser/neutral when we don't have an explicit savedCells mask.
			if (!hasExplicitSavedCells) {
				if (
					currentOwner !== releaserId &&
					currentOwner !== 0 &&
					currentOwner !== nationId
				) {
					continue;
				}
			}

			worldControlMap[idx] = nationId;
			deJureMap[idx] = nationId;
			provinceMap[idx] = getProvinceId(x, y, nationId);

			if (isWar && sideIdx !== -1) {
				landMask[idx] = 2;
				for (let s = 0; s < sideInfluenceMaps.length; s++)
					sideInfluenceMaps[s][idx] = 0;
				if (sideIdx < sideInfluenceMaps.length)
					sideInfluenceMaps[sideIdx][idx] = 1.0;
				syncOccupationFromSideInfluence(idx);
				primaryOccupierMap[idx] = nationId;
			} else {
				if (landMask[idx] === 0) landMask[idx] = 1;
				clearCellInfluence(idx);
				primaryOccupierMap[idx] = 0;
			}

			restoredAny = true;
		}
	}

	if (!restoredAny) {
		loadingOverlay.style.display = "none";
		releaseModal.style.display = "none";
		statusText.innerText = `No valid territory found to release for ${meta.name}.`;
		influenceLayer.render();
		return;
	}

	// If in setup or mid‑war, make sure this nation actually participates on the chosen side
	const newCountry = {
		id: nationId,
		name: meta.name,
		color: meta.color,
		role: "OFFENSE",
		strategy: "BALANCED",
		buffState: "none",
		overlordId: meta.overlordId || null,
		flag: meta.tempFlag || null,
	};

	if (!newCountry.flag && meta.flagUrl) {
		newCountry.flag = new Image();
		newCountry.flag.crossOrigin = "anonymous";
		newCountry.flag.src = meta.flagUrl;
		meta.tempFlag = newCountry.flag;
	}

	if (sideIdx !== -1) {
		if (gameState === "SIMULATING") {
			activateCountryMidWar(newCountry, sideIdx);
		} else {
			if (!sides[sideIdx]) sides[sideIdx] = [];
			if (!sides[sideIdx].some((c) => c.id === nationId)) {
				sides[sideIdx].push(newCountry);
			}
		}
	}

	loadingOverlay.style.display = "none";
	releaseModal.style.display = "none";
	recalculateAllBounds();
	updateSidesUI();
	influenceLayer.render();
	statusText.innerText = `${meta.name} has been released!`;
};

export function _setAsReleasable(releasableId, releaserId) {
	const rMeta = countryMetadata.find((m) => m && m.id === releasableId);
	const hostMeta = countryMetadata.find((m) => m && m.id === releaserId);
	if (!rMeta || !hostMeta) return;

	rMeta.releasableBy = releaserId;

	// Capture territory snapshot for future restoration.
	// IMPORTANT: Only touch cells that are currently owned by the releasable.
	// This makes it visually look like the host fully annexed the releasable,
	// and we restore exactly these cells on release.
	const cells = [];
	for (let i = 0; i < worldControlMap.length; i++) {
		if (worldControlMap[i] === releasableId) {
			const y = Math.floor(i / gridWidth);
			const x = i % gridWidth;
			cells.push([x, y]);
			// Hand this land to the host nation for now so it looks annexed
			worldControlMap[i] = releaserId;
		}
	}
	rMeta.savedCells = cells;

	// Remove from active sides
	sides.forEach((side) => {
		const idx = side.findIndex((c) => c.id === releasableId);
		if (idx > -1) side.splice(idx, 1);
	});

	statusText.innerText = `${rMeta.name} is now a releasable of ${hostMeta.name}`;
	countryInspector.style.display = "none";
	recalculateAllBounds();
	updateSidesUI();
	influenceLayer.render();
}

export function _setVassalage(vassalId, overlordId) {
	const vassalMeta = countryMetadata.find((m) => m && m.id === vassalId);
	if (!vassalMeta) return;

	// Preserve the original flag the first time this country becomes a puppet
	if (!vassalMeta.baseFlagUrl) {
		vassalMeta.baseFlagUrl = vassalMeta.flagUrl || null;
	}

	vassalMeta.overlordId = overlordId;

	// Propagate to sides if active
	sides
		.flat()
		.filter(Boolean)
		.forEach((c) => {
			if (c.id === vassalId) c.overlordId = overlordId;
		});

	const overlordMeta = countryMetadata.find((m) => m && m.id === overlordId);
	statusText.innerText = `${vassalMeta.name} is now a vassal of ${overlordMeta ? overlordMeta.name : "Unknown"}`;

	// Generate a dynamic half-and-half puppet flag for vassals created after game start
	// (existing historical puppets keep their original flags unless re-vassalized through this function).
	generatePuppetFlag(vassalId, overlordId);

	openInspector(vassalId);
	influenceLayer.render();
}

export function recruitNeutralMidWar(id, sideIdx) {
	// 1. Remove from existing side if present (handle mid-war switching)
	let oldSideIdx = -1;
	sides.forEach((side, sIdx) => {
		const idx = side.findIndex((c) => c.id === id);
		if (idx > -1) {
			oldSideIdx = sIdx;
			side.splice(idx, 1);
		}
	});

	const meta = countryMetadata.find((m) => m && m.id === id);
	if (!meta) return;

	const newCountry = {
		id: id,
		name: meta.name,
		color: meta.color,
		role: "OFFENSE",
		strategy: "BALANCED",
		buffState: meta.buffState || "none",
		overlordId: meta.overlordId || null,
	};

	if (!sides[sideIdx]) sides[sideIdx] = [];
	sides[sideIdx].push(newCountry);
	activateCountryMidWar(newCountry, sideIdx);

	updateSidesUI();
	influenceLayer.render();

	const sideLabel = String.fromCharCode(65 + sideIdx);
	if (oldSideIdx !== -1) {
		statusText.innerText = `${newCountry.name} HAS SWITCHED TO SIDE ${sideLabel}`;
	} else {
		statusText.innerText = `${newCountry.name} HAS DEPLOYED TO SIDE ${sideLabel}`;
	}

	// Play sound if possible
	playWarStartSound();
}

export function openInspector(id) {
	editingCountryId = id;
	const meta = countryMetadata.find((m) => m && m.id === id);
	if (!meta) return;

	const isWar = gameState === "SIMULATING";
	const _isNeutral = !sides.flat().some((c) => c.id === id);

	// Toggle editor-only fields, but keep the Combat Buff section visible even in war
	const buffSection = document.getElementById("buff-editor-section");
	document.querySelectorAll("#country-inspector .editor-only").forEach((el) => {
		if (el === buffSection) return; // handle buff separately
		el.style.display = isWar ? "none" : "block";
	});
	if (buffSection) {
		buffSection.style.display = "block";
	}

	const vassalStatusDisplay = document.getElementById("vassal-status-display");
	if (vassalStatusDisplay) {
		if (meta.overlordId) {
			vassalStatusDisplay.style.display = "block";
			const oMeta = countryMetadata.find((m) => m && m.id === meta.overlordId);
			document.getElementById("overlord-name-disp").innerText = oMeta
				? oMeta.name
				: "Unknown";
		} else {
			vassalStatusDisplay.style.display = "none";
		}
	}

	const recruitmentDiv = document.getElementById("mid-war-recruitment");
	const vassalizeBtn = document.getElementById("vassalize-btn");
	const exitConflictBtn = document.getElementById("exit-conflict-btn");
	if (recruitmentDiv) {
		if (isWar) {
			const currentSideIdx = sides.findIndex((s) => s.some((c) => c.id === id));
			recruitmentDiv.style.display = "block";

			if (exitConflictBtn) {
				if (currentSideIdx !== -1) {
					exitConflictBtn.style.display = "block";
					exitConflictBtn.onclick = () => {
						const country = sides[currentSideIdx].find((c) => c.id === id);
						if (country) {
							unilateralExitConflict(country, currentSideIdx);
							countryInspector.style.display = "none";
						}
					};
				} else {
					exitConflictBtn.style.display = "none";
				}
			}
			const btnContainer = document.getElementById("recruit-sides-btns");
			btnContainer.innerHTML = "";

			sides.forEach((_side, idx) => {
				const isCurrentSide = currentSideIdx === idx;
				const btn = document.createElement("button");
				btn.className = "mini-btn";
				const sideLabel = String.fromCharCode(65 + idx);
				btn.innerText = isCurrentSide
					? `ON SIDE ${sideLabel}`
					: `JOIN SIDE ${sideLabel}`;
				btn.style.background = sideColors[idx].replace(rgbaRe, "1)");
				btn.style.padding = "8px 12px";
				btn.style.fontSize = "10px";
				btn.style.fontWeight = "900";
				btn.style.opacity = isCurrentSide ? "0.4" : "1";
				btn.disabled = isCurrentSide;

				if (!isCurrentSide) {
					btn.onclick = () => {
						recruitNeutralMidWar(id, idx);
						countryInspector.style.display = "none";
					};
				}
				btnContainer.appendChild(btn);
			});

			// Vassalization Logic: Check if target can be vassalized
			// Requires enough territory taken by a side
			vassalizeBtn.style.display = "none";
			const stats = latestCountryStats.get(id);
			if (stats) {
				const initial = meta.initialCells || stats.controlled + 100; // fallback if war just started
				const controlPct = stats.controlled / initial;

				// If more than 50% territory taken, show vassalize button for the leading side
				if (controlPct < 0.5) {
					vassalizeBtn.style.display = "block";
					vassalizeBtn.onclick = () => {
						// Find the side that occupies the most of this country
						let bestSideIdx = 0;
						const _maxOcc = 0;
						const sideOccs = new Array(sides.length).fill(0);

						// Sample grid to find dominant occupier
						for (let i = 0; i < worldControlMap.length; i += 50) {
							if (worldControlMap[i] === id && landMask[i] === 2) {
								const occId = primaryOccupierMap[i];
								const sIdx = sides.findIndex((s) =>
									s.some((c) => c.id === occId),
								);
								if (sIdx !== -1) sideOccs[sIdx]++;
							}
						}
						bestSideIdx = sideOccs.indexOf(Math.max(...sideOccs));
						const overlord = sides[bestSideIdx][0];
						if (overlord) {
							meta.overlordId = overlord.id;
							recruitNeutralMidWar(id, bestSideIdx);
							countryInspector.style.display = "none";
						}
					};
				}
			}
		} else {
			recruitmentDiv.style.display = "none";
		}
	}

	// Render current allies
	if (allyList) {
		const allies = Array.isArray(meta.allies) ? meta.allies : [];
		if (!allies.length) {
			allyList.innerHTML = `<span style="font-size: 10px; color: #666;">No allies set.</span>`;
		} else {
			const items = allies
				.map((aid) => countryMetadata[aid - 1])
				.filter(Boolean)
				.map(
					(m) =>
						`<div style="font-size:11px; color:#ccc; margin-bottom:2px;">• ${m.name}</div>`,
				)
				.join("");
			allyList.innerHTML = items;
		}
	}

	const releasables = countryMetadata.filter((m) => m && m.releasableBy === id);
	const releaseContainer = document.getElementById(
		"inspector-release-container",
	);
	const releaseBtn = document.getElementById("inspect-release-btn");
	if (releaseContainer && releaseBtn) {
		if (releasables.length > 0) {
			releaseContainer.style.display = "block";
			releaseBtn.onclick = () => {
				const currentSideIdx = sides.findIndex((s) =>
					s.some((c) => c.id === id),
				);
				openReleaseModal(id, currentSideIdx);
			};
		} else {
			releaseContainer.style.display = "none";
		}
	}

	const inspectorDisplayName = getTranslation(
		meta.name || meta.feature?.properties?.NAME || "Unnamed Land",
		getCookie("mw_lang") || "en",
		"NATIONS",
	);
	inspectNameInput.value = inspectorDisplayName;
	inspectNameInput.disabled = isWar;
	inspectColorSwatch.style.backgroundColor = meta.color;

	// Initialize Buff button state for this country (visible + hidden)
	if (inspectBuffBtn) {
		const currentBuff = meta.buffState || "none";
		const currentHidden = meta.hiddenBuffState || "none";
		const bMeta = BUFF_METADATA[currentBuff] || BUFF_METADATA.none;
		const hMeta = BUFF_METADATA[currentHidden] || BUFF_METADATA.none;
		const hiddenLabel =
			currentHidden !== "none"
				? `<div style="margin-top:4px; font-size:9px; color:#f1c40f; text-transform:uppercase; letter-spacing:0.5px;">INVISIBLE BUFF: ${hMeta.label}</div>`
				: "";
		inspectBuffBtn.innerHTML = `
            <span class="buff-arrow" data-dir="-1" style="font-size:11px; margin-right:4px;">◀</span>
            <span class="buff-label">BUFF: ${bMeta.label}</span>
            <span class="buff-arrow" data-dir="1" style="font-size:11px; margin-left:4px;">▶</span>
            ${hiddenLabel}
        `;
		inspectBuffBtn.style.background = bMeta.color;
		inspectBuffBtn.style.color = bMeta.textColor;
	}

	// Reset file input and update flag preview
	inspectFlagInput.value = "";
	if (meta.flagUrl) {
		inspectFlagPreview.src = meta.flagUrl;
		inspectFlagPreview.style.display = "block";
	} else {
		inspectFlagPreview.style.display = "none";
	}

	// Convert current color to Hex for the picker
	const rgba = meta.rgba;
	const toHex = (n) => n.toString(16).padStart(2, "0");
	const hex = `#${toHex(rgba[0])}${toHex(rgba[1])}${toHex(rgba[2])}`;
	inspectColorPicker.value = hex;

	countryInspector.style.display = "block";
	influenceLayer.render();
}

export function _placeDivisionAt(latlng, sovereignId) {
	let sideIdx = sides.findIndex((s) => s.some((c) => c.id === sovereignId));

	if (sideIdx === -1) {
		if (gameState === "SIMULATING" || godModeActive) {
			sideIdx = 0;
			recruitNeutralMidWar(sovereignId, sideIdx);
		} else {
			statusText.innerText =
				"Nation must be assigned to a side to place units.";
			return;
		}
	}

	const idx = getGridIndex(latlng.lat, latlng.lng);
	const isMountainCell = idx !== -1 && terrainMask && terrainMask[idx] > 0.35;
	const isAlpen = isMountainCell && Math.random() < 0.4;

	units.push({
		id: Math.random(),
		lat: latlng.lat,
		lng: latlng.lng,
		sideIndex: sideIdx,
		sovereignId: sovereignId,
		beneficiaryId: sovereignId,
		isAlpenjager: !!isAlpen,
		health: CONFIG.UNIT_HEALTH * (isAlpen ? CONFIG.ALPEN_HEALTH_MULT : 1),
		lastAttack: 0,
		deployTicks: 10,
	});

	if (sideIdx >= 0 && sideIdx < MAX_SIDES) {
		sideSoldiers[sideIdx] += soldiersPerUnit[sideIdx];
	}

	statusText.innerText = `MANUAL DEPLOYMENT: Division placed for ${countryMetadata[sovereignId - 1]?.name || "Nation"}`;
	influenceLayer.render();
}

export async function _placeNewCountry(latlng) {
	// Do not place new countries outside the world-size box
	if (!isInsideWorldBoxLatLng(latlng.lat, latlng.lng)) return;
	const idx = getGridIndex(latlng.lat, latlng.lng);
	if (idx === -1) return;

	const y = Math.floor(idx / gridWidth);
	const x = idx % gridWidth;

	const maxId = countryMetadata.reduce(
		(max, m) => (m ? Math.max(max, m.id) : max),
		0,
	);
	const id = maxId + 1;
	const newMeta = {
		id: id,
		name: customCountryData.name,
		color: customCountryData.color,
		rgba: parseColorToRGBA(customCountryData.color),
		isCustom: true,
		flagUrl: customCountryData.flagUrl,
		bounds: { minX: x, maxX: x, minY: y, maxY: y },
	};

	// Ensure the array has enough space if there were gaps
	if (id > countryMetadata.length) {
		countryMetadata.push(newMeta);
	} else {
		countryMetadata[id - 1] = newMeta;
	}

	// Assign initial point
	worldControlMap[idx] = id;
	deJureMap[idx] = id;
	provinceMap[idx] = getProvinceId(x, y, id);
	// Mandatory land conversion at capital point
	landMask[idx] = 1;

	gameState = "EDITOR_ACTIVE";
	statusText.innerText = `Nation Established: ${newMeta.name}`;
	map.getContainer().classList.remove("painting-cursor");

	recalculateAllBounds();
	openInspector(id);
	influenceLayer.render();
}

export function _fillAt(latlng) {
	const isUnclaiming = gameState === "EDITOR_UNCLAIMING";
	if (!isUnclaiming && editingCountryId <= 0) return;
	// Do not start fill outside the world-size box
	if (!isInsideWorldBoxLatLng(latlng.lat, latlng.lng)) return;
	const startIdx = getGridIndex(latlng.lat, latlng.lng);
	if (startIdx === -1 || landMask[startIdx] === 0) return;

	const targetId = worldControlMap[startIdx];
	const replacementId = isUnclaiming ? 0 : editingCountryId;
	if (!isUnclaiming && targetId === replacementId) return;

	loadingStatus.innerText = isUnclaiming
		? "Unclaiming Territory..."
		: "Filling Region...";
	loadingOverlay.style.display = "flex";

	const res = CONFIG.GRID_RES;

	// Use a small timeout to let the UI show the loader
	setTimeout(() => {
		const queue = [startIdx];
		const visited = new Uint8Array(gridWidth * gridHeight);
		visited[startIdx] = 1;

		while (queue.length > 0) {
			const idx = queue.pop();

			const y = Math.floor(idx / gridWidth);
			const x = idx % gridWidth;
			const cellLat = (y + 0.5) * res - 90;
			const cellLng = (x + 0.5) * res - 180;

			// Never modify ownership outside the world-size box
			if (!isInsideWorldBoxLatLng(cellLat, cellLng)) continue;

			worldControlMap[idx] = replacementId;

			// Re-sync province ID to the new country owner to prevent border-crossing provinces
			provinceMap[idx] = getProvinceId(x, y, replacementId);

			// Neighbors: N, S, E, W
			const neighbors = [];
			if (y > 0) neighbors.push(idx - gridWidth);
			if (y < gridHeight - 1) neighbors.push(idx + gridWidth);
			if (x > 0) neighbors.push(idx - 1);
			if (x < gridWidth - 1) neighbors.push(idx + 1);

			// Handle world wrapping for East/West if necessary (optional but good for world maps)
			if (x === 0) neighbors.push(idx + (gridWidth - 1));
			if (x === gridWidth - 1) neighbors.push(idx - (gridWidth - 1));

			for (const nIdx of neighbors) {
				if (
					!visited[nIdx] &&
					landMask[nIdx] > 0 &&
					worldControlMap[nIdx] === targetId
				) {
					const ny = Math.floor(nIdx / gridWidth);
					const nx = nIdx % gridWidth;
					const nLat = (ny + 0.5) * res - 90;
					const nLng = (nx + 0.5) * res - 180;

					// Do not flood-fill outside the world-size box
					if (!isInsideWorldBoxLatLng(nLat, nLng)) continue;

					visited[nIdx] = 1;
					queue.push(nIdx);
				}
			}
		}

		recalculateAllBounds();
		loadingOverlay.style.display = "none";
		influenceLayer.render();
	}, 10);
}

map.on("mousedown", (e) => {
	// If the user is interacting with reference image handles, do NOT start painting or terrain tools.
	const targetEl = e.originalEvent?.target;
	if (targetEl?.closest(".ref-handle, .ref-handle-center")) {
		return;
	}

	if (gameState === "EDITOR_PAINTING_TERRAIN") {
		// Before starting terrain paint, ensure we're in Simplified (wargames) mode unless this is a custom canvas.
		const currentImagery = imagerySelect
			? imagerySelect.value
			: getCookie("mw_imagery") || "arcgis";

		// Only prompt/switch if we're NOT already wargames and NOT on a blank/custom terrain map.
		if (currentImagery !== "wargames" && !isCustomTerrain) {
			if (
				confirm(
					"Satellite Directive: Terrain modification requires 'Simplified Mode' to correctly align geography. Switch now?",
				)
			) {
				setImageryProvider("wargames", false);
				if (disableCountryGradientCheckbox) {
					disableCountryGradientCheckbox.checked = true;
					disableCountryGradient = true;
				}
			}
			// After switching (or cancelling), do not treat this same click as a paint event;
			// the user can click again to start painting, which prevents stray lines.
			return;
		}
	}

	if (
		gameState === "EDITOR_PAINTING" ||
		gameState === "EDITOR_UNCLAIMING" ||
		gameState === "EDITOR_PAINTING_TERRAIN"
	) {
		isPainting = true;
		lastPaintLatLng = e.latlng;
		map.dragging.disable();

		// Set paint mask if Alt is held down
		if (e.originalEvent?.altKey) {
			const idx = getGridIndex(e.latlng.lat, e.latlng.lng);
			if (idx !== -1) {
				paintMaskId = worldControlMap[idx];
			} else {
				paintMaskId = -1;
			}
		} else {
			paintMaskId = -1;
		}

		paintAt(e.latlng);
	}
});

map.on("mousemove", (e) => {
	coordsDisplay.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;

	// While dragging reference image handles, ignore painting logic entirely.
	const targetEl = e.originalEvent?.target;
	if (targetEl?.closest(".ref-handle, .ref-handle-center")) {
		return;
	}

	if (
		isPainting &&
		(gameState === "EDITOR_PAINTING" ||
			gameState === "EDITOR_UNCLAIMING" ||
			gameState === "EDITOR_PAINTING_TERRAIN")
	) {
		if (lastPaintLatLng) {
			// INTERPOLATION SYSTEM: "Raycast" between last and current mouse positions.
			// This prevents gaps when dragging the brush faster than the frame rate.
			const p1 = lastPaintLatLng;
			const p2 = e.latlng;

			let dLng = p2.lng - p1.lng;
			if (dLng > 180) dLng -= 360;
			if (dLng < -180) dLng += 360;
			const dLat = p2.lat - p1.lat;

			const dist = Math.sqrt(dLat * dLat + dLng * dLng);
			const step = brushSize * 0.35; // Step every 35% of brush radius

			if (dist > step) {
				const numSteps = Math.ceil(dist / step);
				let changedAny = false;
				for (let i = 1; i <= numSteps; i++) {
					const t = i / numSteps;
					const interpLat = p1.lat + dLat * t;
					let interpLng = p1.lng + dLng * t;
					if (interpLng > 180) interpLng -= 360;
					if (interpLng < -180) interpLng += 360;

					if (applyPaintAt({ lat: interpLat, lng: interpLng })) {
						changedAny = true;
					}
				}
				if (changedAny) {
					influenceLayer._forceRender = true;
					influenceLayer.render();
				}
			} else {
				paintAt(e.latlng);
			}
			lastPaintLatLng = e.latlng;
		} else {
			paintAt(e.latlng);
			lastPaintLatLng = e.latlng;
		}
	}
});

map.on("mouseup", () => {
	if (isPainting) {
		// Update label positions and territory stats after a painting stroke finishes
		recalculateAllBounds();
		influenceLayer.render();
	}
	isPainting = false;
	map.dragging.enable();
});

editorCreateBtn.addEventListener("click", () => {
	createCountryModal.style.display = "flex";
});

cancelCreateBtn.addEventListener("click", () => {
	createCountryModal.style.display = "none";
});

confirmCreateBtn.addEventListener("click", async () => {
	const name = newCountryNameInput.value || "New Nation";
	const color = newCountryColorInput.value;
	const file = newCountryFlagInput.files[0];

	customCountryData = {
		name,
		color: `${color.replace("#", "rgba(")})`, // basic hex to rgba converter simplified
		flagUrl: null,
	};

	// Correct hex to rgba
	const r = parseInt(color.slice(1, 3), 16);
	const g = parseInt(color.slice(3, 5), 16);
	const b = parseInt(color.slice(5, 7), 16);
	customCountryData.color = `rgba(${r}, ${g}, ${b}, 0.5)`;
	customCountryData.displayName = name;

	if (file) {
		try {
			loadingStatus.innerText = "Uploading Flag...";
			loadingOverlay.style.display = "flex";
			customCountryData.flagUrl = await websim.upload(file);
			loadingOverlay.style.display = "none";
		} catch (e) {
			console.error("Flag upload failed", e);
		}
	}

	createCountryModal.style.display = "none";
	gameState = "EDITOR_PLACING";
	statusText.innerText = "Click on Map to Place Capital";
	map.getContainer().classList.add("painting-cursor");
});

inspectNameInput.addEventListener("input", (e) => {
	if (editingCountryId <= 0) return;
	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	if (meta) {
		meta.name = e.target.value;
		// Propagate to live setup/simulation objects
		sides.flat().forEach((c) => {
			if (c.id === editingCountryId) c.name = meta.name;
		});
		updateSidesUI();
		// Ensure labels recalculate their spine/position in real-time
		recalculateAllBounds();
		influenceLayer.render();
	}
});

inspectHubFlagBtn.addEventListener("click", () => {
	openHub("flags");
});

inspectFetchFlagBtn.addEventListener("click", async () => {
	if (editingCountryId <= 0) return;
	const name = inspectNameInput.value.trim();
	if (!name) return;

	let code = findCodeByName(name);

	// Fallback to GeoJSON search if code mapping doesn't have it
	if (!code && rawGeoJsonData) {
		const feature = rawGeoJsonData.features.find((f) => {
			const p = f.properties;
			const possibleNames = [
				p.NAME,
				p.name,
				p.admin,
				p.NAME_LONG,
				p.formal_en,
				p.name_sort,
			]
				.filter(Boolean)
				.map((n) => n.toLowerCase());
			return possibleNames.includes(name.toLowerCase());
		});

		if (feature) {
			const getFeatCode = (feat) => {
				if (!feat?.properties) return null;
				const p = feat.properties;
				let c =
					p.ISO_A2 ||
					p.iso_a2 ||
					p.ISO_A2_EH ||
					p.iso_a2_eh ||
					p.ADDR_A2 ||
					null;
				if (c === "-99") c = null;
				return c ? c.toLowerCase() : null;
			};
			code = getFeatCode(feature);
		}
	}

	if (!code) {
		alert(
			"Could not find a modern flag for '" +
				name +
				"'. Try the full English name.",
		);
		return;
	}

	const flagUrl = `https://flagcdn.com/w160/${code}.webp`;
	updateCountryFlag(editingCountryId, flagUrl);
});

inspectFlagInput.addEventListener("change", async (e) => {
	const file = e.target.files[0];
	if (file && editingCountryId > 0) {
		try {
			loadingStatus.innerText = "Uploading Flag...";
			loadingOverlay.style.display = "flex";
			const url = await websim.upload(file);

			updateCountryFlag(editingCountryId, url);
			loadingOverlay.style.display = "none";
		} catch (err) {
			console.error(err);
			loadingOverlay.style.display = "none";
		}
	}
});

inspectColorPicker.addEventListener("input", (e) => {
	if (editingCountryId <= 0) return;
	const newColorHex = e.target.value;
	const r = parseInt(newColorHex.slice(1, 3), 16);
	const g = parseInt(newColorHex.slice(3, 5), 16);
	const b = parseInt(newColorHex.slice(5, 7), 16);

	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	if (meta) {
		meta.color = `rgba(${r}, ${g}, ${b}, 0.5)`;
		meta.rgba = [r, g, b, 0.5];
		inspectColorSwatch.style.backgroundColor = meta.color;
		influenceLayer.render();
	}
});

shareCountryBtn.addEventListener("click", () => {
	if (editingCountryId <= 0) return;
	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	if (!meta) return;

	shareCountryNameInput.value = meta.name || "Custom Nation";
	shareCountryDescInput.value = "";
	shareCountryModal.style.display = "flex";
});

shareFlagBtn.addEventListener("click", () => {
	if (editingCountryId <= 0) return;
	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	if (!meta?.flagUrl) {
		alert(
			"This nation does not have a flag to share. Upload or fetch one first.",
		);
		return;
	}

	shareFlagNameInput.value = `${meta.name || "Custom"} Flag`;
	shareFlagDescInput.value = "";
	shareFlagModal.style.display = "flex";
});

cancelShareFlagBtn.onclick = () => {
	shareFlagModal.style.display = "none";
};

confirmShareFlagBtn.onclick = async () => {
	if (editingCountryId <= 0) return;
	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	if (!meta?.flagUrl) return;

	const publicName = shareFlagNameInput.value.trim() || "Custom Flag";
	const description = shareFlagDescInput.value.trim();

	shareFlagModal.style.display = "none";
	loadingStatus.innerText = "Sharing Flag to Library...";
	loadingOverlay.style.display = "flex";

	try {
		await room.collection("flag_library_v1").create({
			name: publicName,
			description: description,
			flagUrl: meta.flagUrl,
		});
		loadingOverlay.style.display = "none";
		alert("Flag successfully shared!");
	} catch (e) {
		console.error(e);
		alert("Failed to share flag.");
		loadingOverlay.style.display = "none";
	}
};

cancelShareCountryBtn.onclick = () => {
	shareCountryModal.style.display = "none";
};

confirmShareCountryBtn.onclick = async () => {
	if (editingCountryId <= 0) return;
	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	if (!meta) return;

	const publicName =
		shareCountryNameInput.value.trim() || meta.name || "Custom Nation";
	const description = shareCountryDescInput.value.trim();

	shareCountryModal.style.display = "none";
	loadingStatus.innerText = `Saving ${publicName} to Library...`;
	loadingOverlay.style.display = "flex";

	try {
		// 1. Generate Border Preview
		let previewUrl = null;
		if (influenceLayer?._container) {
			influenceLayer._isCapturing = true;
			influenceLayer.render();
			const canvas = influenceLayer._container;
			const previewBlob = await new Promise((resolve) =>
				canvas.toBlob(resolve, "image/jpeg", 0.8),
			);
			influenceLayer._isCapturing = false;
			influenceLayer.render();
			if (previewBlob) {
				const previewFile = new File([previewBlob], "country_preview.jpg", {
					type: "image/jpeg",
				});
				previewUrl = await websim.upload(previewFile);
			}
		}

		// 2. Collect all cells belonging to this country
		const cells = [];
		for (let i = 0; i < worldControlMap.length; i++) {
			if (worldControlMap[i] === editingCountryId) {
				const y = Math.floor(i / gridWidth);
				const x = i % gridWidth;
				cells.push([x, y]);
			}
		}

		if (cells.length === 0) {
			alert("Country has no territory to share!");
			loadingOverlay.style.display = "none";
			return;
		}

		// 3. Upload Cells Data as a file to bypass 250KB record limit
		const cellsBlob = new Blob([JSON.stringify(cells)], {
			type: "application/json",
		});
		const cellsFile = new File([cellsBlob], "country_cells.json", {
			type: "application/json",
		});
		const cellsUrl = await websim.upload(cellsFile);

		// 4. Create Persistent Record
		await room.collection("country_library_v1").create({
			name: publicName,
			description: description,
			previewUrl: previewUrl,
			color: meta.color,
			flagUrl: meta.flagUrl,
			gridRes: CONFIG.GRID_RES,
			cellsUrl: cellsUrl,
		});

		loadingOverlay.style.display = "none";
		alert("Country added to Global Library!");
	} catch (e) {
		console.error(e);
		alert("Failed to share country.");
		loadingOverlay.style.display = "none";
	}
};

inspectPaintBtn.addEventListener("click", () => {
	gameState = "EDITOR_PAINTING";
	statusText.innerText = "PAINTING BORDERS (Drag to draw)";
	countryInspector.style.display = "none";
	map.getContainer().classList.add("painting-cursor");
	editorPaintBtn.style.display = "block";
	editorFillBtn.style.display = "block";
	editorUnclaimBtn.style.display = "block";
	editorPaintBtn.classList.add("active");
	brushControls.style.display = "flex";
});

inspectAnnexClickBtn.addEventListener("click", () => {
	if (editingCountryId <= 0) return;
	gameState = "EDITOR_ANNEXING";
	statusText.innerText =
		"ANNEX TOOL: Click any country on the map to absorb its land";
	countryInspector.style.display = "none";
	map.getContainer().classList.add("painting-cursor");
});

editorPaintBtn.addEventListener("click", () => {
	if (gameState === "EDITOR_PAINTING") {
		gameState = "EDITOR_ACTIVE";
		statusText.innerText = "Map Editor (Alpha)";
		editorPaintBtn.classList.remove("active");
		map.getContainer().classList.remove("painting-cursor");
		brushControls.style.display = "none";
	} else if (editingCountryId > 0 || gameState === "EDITOR_UNCLAIMING") {
		gameState = "EDITOR_PAINTING";
		statusText.innerText = "PAINTING BORDERS (Drag to draw)";
		editorPaintBtn.classList.add("active");
		editorFillBtn.classList.remove("active");
		editorUnclaimBtn.classList.remove("active");
		map.getContainer().classList.add("painting-cursor");
		brushControls.style.display = "flex";
	}
});

editorFillBtn.addEventListener("click", () => {
	if (
		gameState === "EDITOR_FILLING" ||
		gameState === "EDITOR_FILLING_TERRAIN"
	) {
		const wasTerrain = gameState === "EDITOR_FILLING_TERRAIN";
		gameState = "EDITOR_ACTIVE";
		statusText.innerText = "Map Editor (Alpha)";
		editorFillBtn.classList.remove("active");
		map.getContainer().classList.remove("painting-cursor");
		// If we were filling terrain, return to the terrain menu state
		if (wasTerrain) {
			gameState = "EDITOR_PAINTING_TERRAIN";
			editorTerrainBtn.classList.add("active");
			statusText.innerText = "TERRAIN BRUSH (Paint land or carve oceans)";
			map.getContainer().classList.add("painting-cursor");
			brushControls.style.display = "flex";
			terrainControls.style.display = "flex";
		}
	} else if (gameState === "EDITOR_PAINTING_TERRAIN") {
		gameState = "EDITOR_FILLING_TERRAIN";
		statusText.innerText = "FILL TERRAIN (Click a region)";
		editorFillBtn.classList.add("active");
		editorTerrainBtn.classList.remove("active");
		brushControls.style.display = "none";
		map.getContainer().classList.add("painting-cursor");
	} else if (editingCountryId > 0 || gameState === "EDITOR_UNCLAIMING") {
		gameState = "EDITOR_FILLING";
		statusText.innerText = "FILL TOOL (Click a region)";
		editorFillBtn.classList.add("active");
		editorPaintBtn.classList.remove("active");
		editorUnclaimBtn.classList.remove("active");
		brushControls.style.display = "none";
		map.getContainer().classList.add("painting-cursor");
	}
});

editorUnclaimBtn.addEventListener("click", () => {
	if (gameState === "EDITOR_UNCLAIMING") {
		gameState = "EDITOR_ACTIVE";
		statusText.innerText = "Map Editor (Alpha)";
		editorUnclaimBtn.classList.remove("active");
		map.getContainer().classList.remove("painting-cursor");
		brushControls.style.display = "none";
	} else {
		gameState = "EDITOR_UNCLAIMING";
		statusText.innerText = "UNCLAIM TOOL (Remove country ownership)";
		editorUnclaimBtn.classList.add("active");
		editorPaintBtn.classList.remove("active");
		editorFillBtn.classList.remove("active");
		editorTerrainBtn.classList.remove("active");
		terrainControls.style.display = "none";
		editorPlaceDivisionBtn.classList.remove("active");
		map.getContainer().classList.add("painting-cursor");
		brushControls.style.display = "flex";
	}
});

editorTerrainBtn.addEventListener("click", () => {
	if (gameState === "EDITOR_PAINTING_TERRAIN") {
		gameState = "EDITOR_ACTIVE";
		statusText.innerText = "Map Editor (Alpha)";
		editorTerrainBtn.classList.remove("active");
		map.getContainer().classList.remove("painting-cursor");
		brushControls.style.display = "none";
		terrainControls.style.display = "none";
	} else {
		gameState = "EDITOR_PAINTING_TERRAIN";
		statusText.innerText = "TERRAIN BRUSH (Paint land or carve oceans)";
		editorTerrainBtn.classList.add("active");
		editorPaintBtn.classList.remove("active");
		editorFillBtn.classList.remove("active");
		editorUnclaimBtn.classList.remove("active");
		editorPlaceDivisionBtn.classList.remove("active");
		map.getContainer().classList.add("painting-cursor");
		brushControls.style.display = "flex";
		terrainControls.style.display = "flex";
	}
});

editorPlaceDivisionBtn.addEventListener("click", () => {
	if (gameState === "EDITOR_PLACING_DIVISION") {
		gameState = "EDITOR_ACTIVE";
		statusText.innerText = godModeActive
			? "GOD MODE: Map Editing Active"
			: "Map Editor (Alpha)";
		editorPlaceDivisionBtn.classList.remove("active");
		map.getContainer().classList.remove("painting-cursor");
	} else {
		gameState = "EDITOR_PLACING_DIVISION";
		editingCountryId = -1; // Reset to force selecting a new country source
		statusText.innerText =
			"SELECT SOURCE: Click a nation to deploy its divisions";
		editorPlaceDivisionBtn.classList.add("active");
		editorPaintBtn.classList.remove("active");
		editorFillBtn.classList.remove("active");
		editorUnclaimBtn.classList.remove("active");
		countryInspector.style.display = "none";
		brushControls.style.display = "none";
		map.getContainer().classList.add("painting-cursor");
	}
});

brushSizeSlider.addEventListener("input", (e) => {
	brushSize = parseFloat(e.target.value);
	brushSizeVal.innerText = brushSize.toFixed(1);
});

export async function annexFeatureToCountry(feature, countryId) {
	if (!feature || countryId <= 0) return;

	loadingStatus.innerText = `Annexing ${feature.properties.NAME || feature.properties.name || "Region"}...`;
	loadingOverlay.style.display = "flex";

	// Brief timeout to let UI update
	await new Promise((r) => setTimeout(r, 50));

	const bounds = L.geoJSON(feature).getBounds();
	const res = CONFIG.GRID_RES;
	const sLat = Math.max(0, Math.floor((bounds.getSouth() + 90) / res));
	const eLat = Math.min(
		gridHeight - 1,
		Math.ceil((bounds.getNorth() + 90) / res),
	);
	const sLng = Math.max(0, Math.floor((bounds.getWest() + 180) / res));
	const eLng = Math.min(
		gridWidth - 1,
		Math.ceil((bounds.getEast() + 180) / res),
	);

	for (let y = sLat; y <= eLat; y++) {
		for (let x = sLng; x <= eLng; x++) {
			const lat = y * res - 90 + res * 0.5;
			const lng = x * res - 180 + res * 0.5;
			if (isPointInFeature(lat, lng, feature)) {
				const idx = y * gridWidth + x;
				// Add this land to the country's world control map
				worldControlMap[idx] = countryId;
				// Sync province ID immediately
				provinceMap[idx] = getProvinceId(x, y, countryId);

				const meta = countryMetadata[countryId - 1];
				if (meta) {
					if (!meta.bounds)
						meta.bounds = { minX: x, maxX: x, minY: y, maxY: y };
					meta.bounds.minX = Math.min(meta.bounds.minX, x);
					meta.bounds.maxX = Math.max(meta.bounds.maxX, x);
					meta.bounds.minY = Math.min(meta.bounds.minY, y);
					meta.bounds.maxY = Math.max(meta.bounds.maxY, y);
				}
				// Ensure it's marked as land
				if (landMask[idx] === 0) landMask[idx] = 1;
			}
		}
	}

	loadingOverlay.style.display = "none";
	influenceLayer.render();
}

annexCountryBtn.addEventListener("click", async () => {
	if (!rawGeoJsonData || editingCountryId <= 0) return;
	const name = annexCountryInput.value.trim().toLowerCase();
	if (!name) return;

	const feature = rawGeoJsonData.features.find((f) => {
		const fName = (
			f.properties.NAME ||
			f.properties.name ||
			f.properties.admin ||
			f.properties.NAME_LONG ||
			""
		).toLowerCase();
		return fName === name;
	});

	if (!feature) {
		alert(
			"Country not found in modern reference data. Try names like 'Poland', 'Ukraine', or 'United States of America'.",
		);
		return;
	}

	await annexFeatureToCountry(feature, editingCountryId);
	annexCountryInput.value = "";
});

// Ally controls
if (addAllyBtn) {
	addAllyBtn.addEventListener("click", () => {
		if (editingCountryId <= 0) {
			alert("Select a nation first in the inspector to add allies.");
			return;
		}
		selectingAllyForId = editingCountryId;
		gameState = "EDITOR_SELECTING_ALLY";
		statusText.innerText =
			"Alliance: click another country on the map to ally with.";
		countryInspector.style.display = "none";
		map.getContainer().classList.add("painting-cursor");
	});
}

if (clearAlliesBtn) {
	clearAlliesBtn.addEventListener("click", () => {
		if (editingCountryId <= 0) return;
		const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
		if (!meta?.allies || meta.allies.length === 0) return;
		const allies = [...meta.allies];
		allies.forEach((aid) => {
			const aMeta = countryMetadata[aid - 1];
			if (aMeta && Array.isArray(aMeta.allies)) {
				aMeta.allies = aMeta.allies.filter((id) => id !== editingCountryId);
			}
		});
		meta.allies = [];
		statusText.innerText = "All alliances for this nation have been cleared.";
		openInspector(editingCountryId);
		influenceLayer.render();
	});
}

// Alliance flag upload: sets a shared flag for the whole alliance group (used only in Alliance View / Flag View)
if (allianceFlagInput) {
	allianceFlagInput.addEventListener("change", async (e) => {
		const file = e.target.files[0];
		if (!file || editingCountryId <= 0) return;
		try {
			loadingStatus.innerText = "Uploading Alliance Flag...";
			loadingOverlay.style.display = "flex";
			const url = await websim.upload(file);
			const rootId = getAllianceRootId(editingCountryId);
			if (!rootId) {
				loadingOverlay.style.display = "none";
				alert("Could not resolve alliance group for this nation.");
				return;
			}
			const rootMeta = countryMetadata[rootId - 1];
			if (!rootMeta) {
				loadingOverlay.style.display = "none";
				alert("Alliance root metadata missing.");
				return;
			}
			rootMeta.allianceFlagUrl = url;
			rootMeta.allianceFlagTempFlag = new Image();
			rootMeta.allianceFlagTempFlag.crossOrigin = "anonymous";
			rootMeta.allianceFlagTempFlag.onload = () => {
				loadingOverlay.style.display = "none";
				influenceLayer.render();
			};
			rootMeta.allianceFlagTempFlag.src = url;
			statusText.innerText = "Alliance flag set for this alliance group.";
		} catch (err) {
			console.error("Alliance flag upload failed", err);
			loadingOverlay.style.display = "none";
			alert("Failed to upload alliance flag.");
		}
	});
}

document.getElementById("set-overlord-btn").onclick = () => {
	if (editingCountryId <= 0) return;
	selectingOverlordForId = editingCountryId;
	gameState = "EDITOR_SELECTING_OVERLORD";
	statusText.innerText = "Select Overlord Country (Click map)";
	countryInspector.style.display = "none";
	map.getContainer().classList.add("painting-cursor");
};

document.getElementById("set-releasable-btn").onclick = () => {
	if (editingCountryId <= 0) return;
	selectingOverlordForId = editingCountryId;
	gameState = "EDITOR_SELECTING_RELEASER";
	statusText.innerText = "Select Host Nation (Releaser) on map";
	countryInspector.style.display = "none";
	map.getContainer().classList.add("painting-cursor");
};

document.getElementById("clear-overlord-btn").onclick = () => {
	if (editingCountryId <= 0) return;
	const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
	if (meta) {
		meta.overlordId = null;
		sides.flat().forEach((c) => {
			if (c.id === editingCountryId) c.overlordId = null;
		});

		// If this country had an original flag before puppetization, restore it
		if (meta.baseFlagUrl) {
			updateCountryFlag(editingCountryId, meta.baseFlagUrl);
		}

		statusText.innerText = `Vassal status cleared for ${meta.name}`;
		openInspector(editingCountryId);
		influenceLayer.render();
	}
};

closeInspectorBtn.addEventListener("click", () => {
	countryInspector.style.display = "none";
	editingCountryId = -1;
	influenceLayer.render();
});

if (inspectBuffBtn) {
	inspectBuffBtn.addEventListener("click", (event) => {
		if (editingCountryId <= 0) return;
		const meta = countryMetadata.find((m) => m && m.id === editingCountryId);
		if (!meta) return;

		// Determine direction: clicked arrow uses its data-dir, clicking center cycles forward
		let dir = 1;
		const target = event.target;
		if (target?.classList.contains("buff-arrow")) {
			const d = parseInt(target.getAttribute("data-dir"), 10);
			if (d === -1 || d === 1) dir = d;
		}

		// ALT-click: adjust hidden (invisible) buff that overrides visible buff during play
		if (event.altKey) {
			const currentHidden = meta.hiddenBuffState || "none";
			const nextHidden = cycleBuffState(currentHidden, dir);
			meta.hiddenBuffState = nextHidden;

			// Propagate hidden buff to any live side objects
			sides.flat().forEach((c) => {
				if (c && c.id === editingCountryId) {
					c.hiddenBuffState = nextHidden;
				}
			});

			statusText.innerText = `SECRET BUFF: ${meta.name} hidden buff set to ${BUFF_METADATA[nextHidden]?.label || nextHidden}`;
			influenceLayer.render();
			return;
		}

		// Normal click: adjust visible buff (what the player can see in UI)
		const current = meta.buffState || "none";
		const nextState = cycleBuffState(current, dir);
		meta.buffState = nextState;

		// Propagate visible buff to any live side objects so setup UI matches
		sides.flat().forEach((c) => {
			if (c && c.id === editingCountryId) {
				c.buffState = nextState;
			}
		});

		const bMeta = BUFF_METADATA[nextState] || BUFF_METADATA.none;
		inspectBuffBtn.innerHTML = `
            <span class="buff-arrow" data-dir="-1" style="font-size:11px; margin-right:4px;">◀</span>
            <span class="buff-label">BUFF: ${bMeta.label}</span>
            <span class="buff-arrow" data-dir="1" style="font-size:11px; margin-left:4px;">▶</span>
        `;
		inspectBuffBtn.style.background = bMeta.color;
		inspectBuffBtn.style.color = bMeta.textColor;

		// Refresh setup UI so side slots show the new visible buff
		updateSidesUI();
		influenceLayer.render();
	});
}

// City inspector logic
export function refreshCityOwnerSelect(selectedOwnerId) {
	if (!cityOwnerSelect) return;
	cityOwnerSelect.innerHTML = '<option value="">(None)</option>';
	countryMetadata.forEach((m) => {
		if (!m) return;
		const opt = document.createElement("option");
		opt.value = m.id;
		opt.textContent = m.name;
		if (selectedOwnerId && selectedOwnerId === m.id) opt.selected = true;
		cityOwnerSelect.appendChild(opt);
	});
}

export function openCityInspector(cityId) {
	const city = cities.find((c) => c.id === cityId);
	if (!city) return;
	editingCityId = cityId;
	cityInspector.style.display = "block";
	cityNameInput.value = city.name || "";
	refreshCityOwnerSelect(city.ownerId || city.sovereignId || null);
	cityCapitalCheckbox.checked = !!city.isCapital;
}

cityNameInput.addEventListener("input", (e) => {
	if (editingCityId <= 0) return;
	const city = cities.find((c) => c.id === editingCityId);
	if (!city) return;
	city.name = e.target.value;
	influenceLayer.render();
});

cityOwnerSelect.addEventListener("change", () => {
	if (editingCityId <= 0) return;
	const city = cities.find((c) => c.id === editingCityId);
	if (!city) return;
	const val = parseInt(cityOwnerSelect.value || "0", 10);
	city.ownerId = val || null;
	city.sovereignId = city.ownerId;
	influenceLayer.render();
});

cityCapitalCheckbox.addEventListener("change", () => {
	if (editingCityId <= 0) return;
	const city = cities.find((c) => c.id === editingCityId);
	if (!city) return;
	const ownerId = city.ownerId || city.sovereignId;
	city.isCapital = cityCapitalCheckbox.checked;
	if (ownerId && city.isCapital) {
		// Clear capital flag on other cities of this owner
		cities.forEach((c) => {
			if (c.id !== city.id && (c.ownerId || c.sovereignId) === ownerId) {
				c.isCapital = false;
			}
		});
	}
	influenceLayer.render();
});

cityMoveBtn.addEventListener("click", () => {
	if (editingCityId <= 0) return;
	statusText.innerText = "City Move: click on the map to set the new position.";
	cityEditMode = "MOVE";
	cityInspector.style.display = "none";
});

cityDeleteBtn.addEventListener("click", () => {
	if (editingCityId <= 0) return;
	const city = cities.find((c) => c.id === editingCityId);
	if (!city) return;
	if (!confirm(`Delete city "${city.name}"?`)) return;
	cities = cities.filter((c) => c.id !== editingCityId);
	activeTheaterCities = activeTheaterCities.filter(
		(c) => c.id !== editingCityId,
	);
	editingCityId = -1;
	cityInspector.style.display = "none";
	influenceLayer.render();
	statusText.innerText = "City deleted.";
});

cityCloseBtn.addEventListener("click", () => {
	cityInspector.style.display = "none";
	editingCityId = -1;
});

editorExitBtn.addEventListener("click", () => {
	location.reload(); // Quick reset
});

if (editorMapSettingsBtn && mapSettingsModal) {
	editorMapSettingsBtn.addEventListener("click", () => {
		// Pre-fill fields from current state
		mapSettingsNameInput.value = mapName || "";
		mapSettingsWidthInput.value = worldWidthDeg || 360;
		mapSettingsHeightInput.value = worldHeightDeg || 180;
		mapSettingsMissilesCheckbox.checked = !!missilesEnabled;
		mapSettingsModal.style.display = "flex";
	});
}

if (mapSettingsCancelBtn && mapSettingsModal) {
	mapSettingsCancelBtn.addEventListener("click", () => {
		mapSettingsModal.style.display = "none";
	});
}

if (mapSettingsApplyBtn && mapSettingsModal) {
	mapSettingsApplyBtn.addEventListener("click", () => {
		const newName = mapSettingsNameInput.value.trim() || "Untitled Map";
		const newW = parseFloat(mapSettingsWidthInput.value) || 360;
		const newH = parseFloat(mapSettingsHeightInput.value) || 180;
		const newMissilesEnabled = !!mapSettingsMissilesCheckbox.checked;

		const sizeChanged = newW !== worldWidthDeg || newH !== worldHeightDeg;

		mapName = newName;
		missilesEnabled = newMissilesEnabled;

		// If size changed, apply bounds and force Simplified mode if not already there
		if (sizeChanged) {
			const currentImagery = imagerySelect
				? imagerySelect.value
				: getCookie("mw_imagery") || "arcgis";
			const allowSwitch = currentImagery !== "wargames";
			applyWorldBounds(newW, newH, allowSwitch);
		} else {
			// Still enforce bounding box if it was never set
			applyWorldBounds(newW, newH, false);
		}

		// Sync missiles toggle with simulation-level bombsDisabled and checkboxes
		if (disableBombsCheckbox) {
			disableBombsCheckbox.checked = !missilesEnabled;
		}
		bombsDisabled = disableBombsCheckbox?.checked || !missilesEnabled;

		mapSettingsModal.style.display = "none";
		statusText.innerText = `MAP SETTINGS UPDATED: ${mapName}`;
		influenceLayer.render();
	});
}

/**
 * Editor tools paging: split the crowded toolbox into two pages.
 * Page 1: scenario-level tools; Page 2: country library / ZIP tools.
 */
export function clearRefHandles() {
	refHandles.forEach((h) => {
		map.removeLayer(h);
	});
	refHandles = [];
}

export function updateRefHandles() {
	clearRefHandles();
	if (!referenceOverlay || !referenceImageUrl) return;

	const bounds = referenceOverlay.getBounds();
	const nw = bounds.getNorthWest();
	const ne = bounds.getNorthEast();
	const sw = bounds.getSouthWest();
	const se = bounds.getSouthEast();
	const center = bounds.getCenter();

	const handleIcon = L.divIcon({
		className: "ref-handle",
		html: '<div style="width:14px; height:14px; background:#27ae60; border:2px solid #fff; border-radius:50%; box-shadow:0 0 8px rgba(0,0,0,0.6);"></div>',
		iconSize: [14, 14],
		iconAnchor: [7, 7],
	});

	const centerHandleIcon = L.divIcon({
		className: "ref-handle-center",
		html: '<div style="width:20px; height:20px; background:#2e86de; border:2px solid #fff; border-radius:50%; box-shadow:0 0 10px rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:bold;">✥</div>',
		iconSize: [20, 20],
		iconAnchor: [10, 10],
	});

	// 1. Center Handle (Move)
	const mCenter = L.marker(center, {
		icon: centerHandleIcon,
		draggable: true,
	}).addTo(map);
	mCenter.on("dragstart", () => {
		// Disable map dragging while manipulating the reference image center handle
		map.dragging.disable();
	});
	mCenter.on("drag", (e) => {
		const newCenter = e.target.getLatLng();
		const dLat = newCenter.lat - center.lat;
		const dLng = newCenter.lng - center.lng;
		const newBounds = [
			[nw.lat + dLat, nw.lng + dLng],
			[se.lat + dLat, se.lng + dLng],
		];
		referenceOverlay.setBounds(newBounds);
	});
	mCenter.on("dragend", (e) => {
		map.dragging.enable();
		updateRefHandles(e);
	});
	refHandles.push(mCenter);

	// 2. Corner Handles (Resize)
	const corners = [
		{ pos: nw, name: "nw" },
		{ pos: ne, name: "ne" },
		{ pos: sw, name: "sw" },
		{ pos: se, name: "se" },
	];

	corners.forEach((c) => {
		const marker = L.marker(c.pos, { icon: handleIcon, draggable: true }).addTo(
			map,
		);
		marker.on("dragstart", () => {
			// Disable map dragging while resizing the reference image with a corner handle
			map.dragging.disable();
		});
		marker.on("drag", (e) => {
			const newPos = e.target.getLatLng();
			let newBounds;
			if (c.name === "nw") newBounds = L.latLngBounds(newPos, se);
			else if (c.name === "ne") newBounds = L.latLngBounds(newPos, sw);
			else if (c.name === "sw") newBounds = L.latLngBounds(newPos, ne);
			else if (c.name === "se") newBounds = L.latLngBounds(newPos, nw);

			if (newBounds) referenceOverlay.setBounds(newBounds);
		});
		marker.on("dragend", (e) => {
			// Re-enable map dragging once the handle drag is finished
			map.dragging.enable();
			updateRefHandles(e);
		});
		refHandles.push(marker);
	});
}

if (editorToolsPage1Btn) {
	editorToolsPage1Btn.addEventListener("click", () => updateEditorToolPage(1));
}
if (editorToolsPage2Btn) {
	editorToolsPage2Btn.addEventListener("click", () => updateEditorToolPage(2));
}
if (editorToolsPage3Btn) {
	editorToolsPage3Btn.addEventListener("click", () => updateEditorToolPage(3));
}
if (editorToolsPage4Btn) {
	editorToolsPage4Btn.addEventListener("click", () => updateEditorToolPage(4));
}
if (editorToolsPage5Btn) {
	editorToolsPage5Btn.addEventListener("click", () => updateEditorToolPage(5));
}

editorTestBtn.addEventListener("click", () => {
	if (countryMetadata.length < 2) {
		alert("You need at least 2 nations to test a conflict.");
		return;
	}
	gameMode = "EDITOR_TEST";
	gameState = "SELECTING_P1";
	statusText.innerText = "Test: Select First Country";
	editorToolbox.style.display = "none";
	setupPanel.style.display = "block";
	setupOptions.style.display = "none";
	resetBtn.style.display = "block";

	// Clear selections
	_attackers = [];
	_defenders = [];

	updateSidesUI();
	influenceLayer.render();
});

editorSaveBtn.addEventListener("click", () => {
	const presetName = prompt(
		"Enter a name for this preset:",
		"My Custom Scenario",
	);
	if (!presetName) return;

	const saveData = generatePresetData(presetName);
	const blob = new Blob([JSON.stringify(saveData)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${presetName.replace(/\s+/g, "_")}_preset.json`;
	a.click();
	URL.revokeObjectURL(url);
});

export function resetConflictSetupState() {
	sides = [[], []];
	_attackers = sides[0];
	_defenders = sides[1];
	activeSideIndex = 0;
	sideSoldiers.fill(0);
	initialSideSoldiers.fill(0);
	soldiersPerUnit.fill(CONFIG.UNIT_TO_SOLDIER_RATIO);
	sideCasualties.fill(0);
	units = [];
	bases = [];
	bombs = [];
	explosions = [];
	activeBattles = []; _battleHash.clear();
	capitalLostCountries = new Set();
	activeRebellion = null;
	countryCasualties.clear();
	casualtyByAttacker.clear();
	latestCountryStats.clear();
	selectedCountryIds.clear();
	editingCityId = -1;
	paintMaskId = -1;
	gameTimeEnabled = false;
	gameTimeDate = null;
	gameTimeAccumulatorMs = 0;
	if (gameDateDisplay) {
		gameDateDisplay.style.display = "none";
	}
	treatyAlert.style.display = "none";
	statusText.innerText = getTranslation("SELECT_P1");
	unitCountsDiv.style.display = "none";
	statsPanel.style.display = "none";
	casualtyPanel.style.display = "none";
	document.getElementById("speed-controls").style.display = "none";
	godModeBtn.style.display = gameMode === "CONQUEST" ? "block" : "none";
	forcePeaceBtn.style.display = "none";
	resetBtn.style.display = "block";
	restartScenarioBtn.style.display = "block";
	updateRestartVisibility();
}

editorLoadBtn.addEventListener("click", () => {
	initAudio();
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json";
	input.onchange = (e) => {
		currentScenarioContext = null;
		setLoadingThematic(true);
		performPresetLoad(e.target.files[0], "EDITOR");
	};
	input.click();
});

editorHubBtn.addEventListener("click", () => {
	openHub("scenarios");
});

editorLibraryBtn.addEventListener("click", () => {
	openHub("countries");
});

document
	.getElementById("editor-save-country-btn")
	.addEventListener("click", () => {
		if (editingCountryId <= 0) return;
		saveCountryLocally(editingCountryId);
	});

document
	.getElementById("editor-load-country-btn")
	.addEventListener("click", () => {
		loadCountryFromPC();
	});

if (editorSaveMultiBtn) {
	editorSaveMultiBtn.addEventListener("click", async () => {
		if (selectedCountryIds.size === 0) {
			alert(
				"Ctrl+click countries on the map to select them, then use this button to export a ZIP.",
			);
			return;
		}

		const ids = Array.from(selectedCountryIds);
		const zip = new JSZip();

		// Ensure each selected country has up-to-date savedCells and metadata
		ids.forEach((id) => {
			const meta = countryMetadata.find((m) => m && m.id === id);
			if (!meta) return;

			// Build or refresh savedCells snapshot
			const cells = [];
			for (let i = 0; i < worldControlMap.length; i++) {
				if (worldControlMap[i] === id) {
					const y = Math.floor(i / gridWidth);
					const x = i % gridWidth;
					cells.push([x, y]);
				}
			}
			meta.savedCells = cells;

			const countryData = {
				id: meta.id,
				name: meta.name,
				color: meta.color,
				flagUrl: meta.flagUrl,
				isCustom: meta.isCustom || false,
				role: meta.role || "OFFENSE",
				overlordId: meta.overlordId || null,
			};

			const presetData = {
				name: `${meta.name}_country`,
				metadata: countryData,
				cells: cells,
				gridRes: CONFIG.GRID_RES,
				version: "1.0",
			};

			const safeName = (meta.name || `country_${id}`).replace(/[^\w-]+/g, "_");
			zip.file(`${safeName}.json`, JSON.stringify(presetData, null, 2));
		});

		try {
			const blob = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "selected_countries.zip";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			statusText.innerText = `Exported ${ids.length} countr${ids.length === 1 ? "y" : "ies"} to selected_countries.zip`;
		} catch (err) {
			console.error("ZIP export failed:", err);
			alert("Failed to generate ZIP. Check console for details.");
		}
	});
}

/**
 * Save all countries with any territory in the scenario into a ZIP of per‑country JSONs.
 */
if (editorSaveAllZipBtn) {
	editorSaveAllZipBtn.addEventListener("click", async () => {
		if (!countryMetadata || !worldControlMap) {
			alert("No map is loaded yet.");
			return;
		}

		const zip = new JSZip();

		// Build a quick presence map (which ids actually have tiles)
		const hasTiles = new Set();
		for (let i = 0; i < worldControlMap.length; i++) {
			const id = worldControlMap[i];
			if (id > 0) hasTiles.add(id);
		}

		const candidates = countryMetadata.filter(
			(m) => m?.id && hasTiles.has(m.id),
		);
		if (candidates.length === 0) {
			alert("No countries with territory to export.");
			return;
		}

		candidates.forEach((meta) => {
			const cells = [];
			for (let i = 0; i < worldControlMap.length; i++) {
				if (worldControlMap[i] === meta.id) {
					const y = Math.floor(i / gridWidth);
					const x = i % gridWidth;
					cells.push([x, y]);
				}
			}

			const countryData = {
				id: meta.id,
				name: meta.name,
				color: meta.color,
				flagUrl: meta.flagUrl,
				isCustom: meta.isCustom || false,
				role: meta.role || "OFFENSE",
				overlordId: meta.overlordId || null,
			};

			const presetData = {
				name: `${meta.name}_country`,
				metadata: countryData,
				cells: cells,
				gridRes: CONFIG.GRID_RES,
				version: "1.0",
			};

			const safeName = (meta.name || `country_${meta.id}`).replace(
				/[^\w-]+/g,
				"_",
			);
			zip.file(`${safeName}.json`, JSON.stringify(presetData, null, 2));
		});

		try {
			const blob = await zip.generateAsync({ type: "blob" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "all_countries.zip";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			statusText.innerText = `Exported ${candidates.length} countries to all_countries.zip`;
		} catch (err) {
			console.error("ZIP export (all countries) failed:", err);
			alert(
				"Failed to generate ZIP for all countries. Check console for details.",
			);
		}
	});
}

/**
 * Load multiple country JSON files from a ZIP and merge them into the current scenario.
 */

// -------- Overlay Tools Implementation --------

document
	.getElementById("custom-sat-input")
	?.addEventListener("change", async (e) => {
		const file = e.target.files[0];
		if (!file) return;
		loadingStatus.innerText = "Uploading Background Overlay...";
		loadingOverlay.style.display = "flex";
		try {
			const url = await websim.upload(file);
			customSatelliteUrl = url;
			customSatelliteImg = new Image();
			customSatelliteImg.crossOrigin = "anonymous";
			customSatelliteImg.onload = () => {
				loadingOverlay.style.display = "none";
				influenceLayer.render();
			};
			customSatelliteImg.src = url;
		} catch (err) {
			console.error(err);
			loadingOverlay.style.display = "none";
		}
	});

document.getElementById("clear-sat-btn")?.addEventListener("click", () => {
	customSatelliteUrl = null;
	customSatelliteImg = null;
	influenceLayer.render();
});

document
	.getElementById("ref-image-input")
	?.addEventListener("change", async (e) => {
		const file = e.target.files[0];
		if (!file) return;
		loadingStatus.innerText = "Processing Reference Image...";
		loadingOverlay.style.display = "flex";
		try {
			const url = await websim.upload(file);
			referenceImageUrl = url;
			if (referenceOverlay) map.removeLayer(referenceOverlay);

			// Load image to get natural dimensions for aspect ratio preservation
			const img = new Image();
			img.onload = () => {
				const aspect = img.width / img.height;
				const center = map.getCenter();
				const h = 20 * refScale;
				const w = h * aspect;
				const bounds = [
					[center.lat - h, center.lng - w],
					[center.lat + h, center.lng + w],
				];

				referenceOverlay = L.imageOverlay(url, bounds, {
					opacity: refOpacity,
					interactive: false,
					pane: "refImagePane",
				}).addTo(map);
				updateRefHandles();
				loadingOverlay.style.display = "none";
			};
			img.src = url;
		} catch (err) {
			console.error(err);
			loadingOverlay.style.display = "none";
		}
	});

document
	.getElementById("ref-opacity-slider")
	?.addEventListener("input", (e) => {
		refOpacity = parseFloat(e.target.value);
		if (referenceOverlay) referenceOverlay.setOpacity(refOpacity);
		if (influenceLayer) {
			influenceLayer._forceRender = true;
			influenceLayer.render();
		}
	});

export const refAboveCheckbox = document.getElementById("ref-above-checkbox");
if (refAboveCheckbox) {
	// Initialize checkbox from current state when opening editor
	refAboveCheckbox.checked = !!refAboveTerrain;
	refAboveCheckbox.addEventListener("change", (e) => {
		refAboveTerrain = !!e.target.checked;
		// No need to change Leaflet pane; we composite into the canvas.
		if (influenceLayer) {
			influenceLayer._forceRender = true;
			influenceLayer.render();
		}
	});
}

document.getElementById("ref-scale-slider")?.addEventListener("input", (e) => {
	refScale = parseFloat(e.target.value);
	if (referenceOverlay && referenceImageUrl) {
		const center = referenceOverlay.getBounds().getCenter();
		const w = 40 * refScale;
		const h = 25 * refScale;
		const newBounds = [
			[center.lat - h, center.lng - w],
			[center.lat + h, center.lng + w],
		];
		referenceOverlay.setBounds(newBounds);
		updateRefHandles();
	}
});

document.getElementById("clear-ref-btn")?.addEventListener("click", () => {
	if (referenceOverlay) map.removeLayer(referenceOverlay);
	referenceOverlay = null;
	referenceImageUrl = null;
	clearRefHandles();
});

document
	.getElementById("editor-download-map-btn")
	?.addEventListener("click", () => {
		if (!worldControlMap || !landMask) return;

		statusText.innerText = "GENERATING GLOBAL MAP EXPORT...";

		// GLOBAL EXPORT SYSTEM: Produces a 1:1 Plate Carree projection of the world grid.
		// This allows the resulting PNG to be re-imported as a Custom Satellite background
		// that aligns perfectly with the engine's geographical coordinate system.
		const canvas = document.createElement("canvas");
		canvas.width = gridWidth;
		canvas.height = gridHeight;
		const ctx = canvas.getContext("2d");
		const imgData = ctx.createImageData(gridWidth, gridHeight);
		const data = imgData.data;

		for (let i = 0; i < worldControlMap.length; i++) {
			const _sid = worldControlMap[i];
			const lm = landMask[i];

			// Base Palette (Matches 'wargames' mode)
			let r = 5,
				g = 52,
				b = 72; // Deep Ocean Blue

			if (lm > 0) {
				// Country colors are excluded from the terrain layout export for a cleaner reference image
				r = 20;
				g = 38;
				b = 20; // Dark Military Green (Neutral Land)
			}

			// Project grid cell index to image pixel coordinates (Flipping Y axis)
			const gx = i % gridWidth;
			const gy = Math.floor(i / gridWidth);
			const ty = gridHeight - 1 - gy;
			const pixelIdx = (ty * gridWidth + gx) * 4;

			data[pixelIdx] = r;
			data[pixelIdx + 1] = g;
			data[pixelIdx + 2] = b;
			data[pixelIdx + 3] = 255;
		}

		ctx.putImageData(imgData, 0, 0);

		try {
			const link = document.createElement("a");
			const timestamp = Date.now();
			link.download = `modern_wars_world_layout_${timestamp}.png`;
			link.href = canvas.toDataURL("image/png");
			link.click();
			statusText.innerText = "GLOBAL MAP EXPORTED";
		} catch (e) {
			console.error("Export failed:", e);
			alert("SATELLITE ERROR: Could not generate export file.");
		}
	});

// -------- Procedural Nation Generation (For empty presets) --------
export const noNationsModal = document.getElementById("no-nations-modal");

export const randomNationsCountInput = document.getElementById(
	"random-nations-count",
);
export const confirmRandomGenBtn = document.getElementById(
	"confirm-random-gen-btn",
);
export const skipRandomGenBtn = document.getElementById("skip-random-gen-btn");

/**
 * Procedurally populates all land cells on the map with a specified number of random nations.
 * Uses an interleaved BFS expansion to ensure organic, relatively balanced territory sizes.
 */
export async function spawnRandomNationsAcrossMap(count) {
	if (!worldControlMap || !landMask) return;

	loadingStatus.innerText = "Generating Civilizations...";
	loadingOverlay.style.display = "flex";

	// 1. Identify all valid land indices
	const landIndices = [];
	for (let i = 0; i < landMask.length; i++) {
		if (landMask[i] > 0) {
			landIndices.push(i);
			worldControlMap[i] = 0; // Ensure unowned start
		}
	}

	if (landIndices.length === 0) {
		loadingOverlay.style.display = "none";
		alert(
			"SATELLITE ERROR: No landmass identified to populate with civilizations.",
		);
		return;
	}

	const actualCount = Math.min(count, landIndices.length);
	const queues = [];

	// 2. Pick random seeds and initialize metadata
	countryMetadata = [];
	for (let i = 0; i < actualCount; i++) {
		let randIdx;
		let attempts = 0;
		// Try to pick seeds that aren't already taken
		do {
			randIdx = landIndices[Math.floor(Math.random() * landIndices.length)];
			attempts++;
		} while (worldControlMap[randIdx] !== 0 && attempts < 100);

		const id = i + 1;
		worldControlMap[randIdx] = id;

		const h = Math.floor(Math.random() * 360);
		const s = 60 + Math.random() * 30;
		const l = 40 + Math.random() * 20;
		const color = `hsla(${h}, ${s}%, ${l}%, 0.5)`;

		const prefixes = [
			"United",
			"New",
			"Grand",
			"Great",
			"North",
			"South",
			"East",
			"West",
			"Holy",
			"Royal",
			"Federal",
			"Imperial",
			"Democratic",
			"People's",
			"Sovereign",
		];
		const roots = [
			"Balt",
			"Nord",
			"Slav",
			"Franc",
			"Goth",
			"Rhone",
			"Iber",
			"Sax",
			"Slavia",
			"Anglo",
			"Lat",
			"Turk",
			"Persia",
			"Indo",
			"Sino",
			"Nippon",
			"Austral",
			"Afro",
			"Euro",
			"Ameri",
			"Veld",
			"Arid",
			"Boreal",
			"Luso",
			"Fenn",
			"Celt",
			"Gallic",
			"Helvet",
			"Austr",
			"Magyar",
			"Pannoni",
			"Daci",
			"Thrac",
			"Levant",
			"Mesopotam",
		];
		const suffixes = [
			"ia",
			"stan",
			"land",
			"ica",
			"any",
			"os",
			"nia",
			"ria",
			"via",
			"dia",
			"zania",
			"ga",
			"tania",
			"onia",
			"esia",
		];
		const forms = [
			"{Prefix} {Root}{Suffix}",
			"Republic of {Root}{Suffix}",
			"Kingdom of {Root}{Suffix}",
			"{Root}{Suffix} Empire",
			"Federation of {Prefix} {Root}{Suffix}",
			"United {Root}{Suffix} States",
			"{Root}{Suffix} Commonwealth",
		];

		const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
		const root = roots[Math.floor(Math.random() * roots.length)];
		const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
		const form = forms[Math.floor(Math.random() * forms.length)];

		const name = form
			.replace("{Prefix}", prefix)
			.replace("{Root}", root)
			.replace("{Suffix}", suffix);

		const newMeta = {
			id: id,
			name: name,
			color: color,
			rgba: parseColorToRGBA(color),
			isCustom: true,
			bounds: {
				minX: Infinity,
				maxX: -Infinity,
				minY: Infinity,
				maxY: -Infinity,
			},
		};
		countryMetadata.push(newMeta);

		queues.push([randIdx]);
	}

	// 3. Interleaved Expansion (BFS)
	// We expand each nation one "step" at a time in a round-robin to prevent one nation
	// from instantly claiming a giant continent while others are stuck.
	let unclaimedLand = true;
	let iterations = 0;

	while (unclaimedLand) {
		unclaimedLand = false;
		iterations++;

		if (iterations % 100 === 0) {
			await new Promise((r) => setTimeout(r, 0));
		}

		for (let i = 0; i < actualCount; i++) {
			const q = queues[i];
			const id = i + 1;
			const nextLevel = [];

			while (q.length > 0) {
				const curr = q.shift();
				const x = curr % gridWidth;
				const _y = Math.floor(curr / gridWidth);

				const neighbors = [
					curr + 1,
					curr - 1,
					curr + gridWidth,
					curr - gridWidth,
				];

				for (const nIdx of neighbors) {
					if (nIdx < 0 || nIdx >= worldControlMap.length) continue;
					// Horizontal wrapping check
					const nx = nIdx % gridWidth;
					if (Math.abs(nx - x) > 1) continue;

					if (landMask[nIdx] > 0 && worldControlMap[nIdx] === 0) {
						worldControlMap[nIdx] = id;
						nextLevel.push(nIdx);
						unclaimedLand = true;
					}
				}

				// Only process one "layer" per nation per round
				if (q.length === 0) {
					queues[i] = nextLevel;
					break;
				}
			}
		}
	}

	generateProvinces();
	recalculateAllBounds();
	loadingOverlay.style.display = "none";
	influenceLayer.render();
	statusText.innerText = `WORLD POPULATED: ${actualCount} nations established.`;
}

// -------- Import Country From Scenario (editor / godmode) --------

export function populateImportCountrySelect() {
	if (!importScenarioBuffer || !importCountryCardList || !importCountrySearch)
		return;
	const metaList = importScenarioBuffer.metadata || [];
	if (!metaList.length) {
		importCountryCardList.innerHTML = `
            <div style="font-size:11px; color:#777; text-align:center; padding:10px;">
                No countries found in scenario
            </div>
        `;
		importCountrySearch.disabled = true;
		selectedImportCountryId = null;
		importScenarioCountriesCache = [];
		return;
	}

	// Count tiles per country id in the source scenario for a useful size hint
	const mapData = importScenarioBuffer.mapData || [];
	const tileCounts = new Map();
	mapData.forEach(([_idx, val]) => {
		if (!val) return;
		tileCounts.set(val, (tileCounts.get(val) || 0) + 1);
	});

	const sortedMeta = metaList
		.filter((m) => m?.id)
		.map((m) => {
			const tiles = tileCounts.get(m.id) || 0;
			// Try to find a flagUrl from metadata if present
			const flagUrl = m.flagUrl || null;
			return {
				id: m.id,
				name: m.name || `Country ${m.id}`,
				tiles,
				flagUrl,
			};
		})
		.filter((m) => m.tiles > 0)
		.sort((a, b) => b.tiles - a.tiles || a.name.localeCompare(b.name));

	if (!sortedMeta.length) {
		importCountryCardList.innerHTML = `
            <div style="font-size:11px; color:#777; text-align:center; padding:10px;">
                No countries with territory found
            </div>
        `;
		importCountrySearch.disabled = true;
		selectedImportCountryId = null;
		importScenarioCountriesCache = [];
		return;
	}

	importScenarioCountriesCache = sortedMeta;
	selectedImportCountryId = null;
	importCountrySearch.disabled = false;
	importCountrySearch.value = "";
	renderImportCountryCards("");
}

export function openImportCountryModal() {
	if (!importCountryModal) return;
	if (!(gameMode === "EDITOR" || godModeActive)) {
		alert("You can only import from scenario while in the editor or God Mode.");
		return;
	}

	// If we already have a loaded source scenario, reuse it and its country list
	if (importScenarioBuffer && importScenarioCountriesCache.length > 0) {
		importCountryModal.style.display = "flex";
		if (importScenarioSelect && lastImportScenarioKey) {
			importScenarioSelect.value = lastImportScenarioKey;
		}
		if (importScenarioFileInput) {
			importScenarioFileInput.style.display = "none";
		}
		if (importCountrySearch) {
			// Keep any existing search text; just ensure the field is enabled
			importCountrySearch.disabled = false;
		}
		// Re-render cards from cache (filtered by current search if any)
		renderImportCountryCards(
			importCountrySearch ? importCountrySearch.value : "",
		);
		return;
	}

	// Fresh open with no cached source scenario
	importScenarioBuffer = null;
	selectedImportCountryId = null;
	importScenarioCountriesCache = [];
	if (importScenarioSelect) importScenarioSelect.value = "";
	if (importScenarioFileInput) {
		importScenarioFileInput.value = "";
		importScenarioFileInput.style.display = "none";
	}
	if (importCountrySearch) {
		importCountrySearch.value = "";
		importCountrySearch.disabled = true;
	}
	if (importCountryCardList) {
		importCountryCardList.innerHTML = `
            <div style="font-size:11px; color:#777; text-align:center; padding:10px;">
                Choose a source scenario first
            </div>
        `;
	}
	importCountryModal.style.display = "flex";
}

if (editorImportCountryBtn) {
	editorImportCountryBtn.addEventListener("click", () => {
		openImportCountryModal();
	});
}

if (importCountryCancelBtn) {
	importCountryCancelBtn.addEventListener("click", () => {
		importCountryModal.style.display = "none";
	});
}

if (importScenarioSelect) {
	importScenarioSelect.addEventListener("change", async (e) => {
		const val = e.target.value;
		lastImportScenarioKey = val || null;
		importScenarioBuffer = null;
		selectedImportCountryId = null;
		if (importCountrySearch) {
			importCountrySearch.value = "";
			importCountrySearch.disabled = true;
		}
		if (importCountryCardList) {
			importCountryCardList.innerHTML = `
                <div style="font-size:11px; color:#777; text-align:center; padding:10px;">
                    Loading…
                </div>
            `;
		}

		if (val === "file") {
			if (importScenarioFileInput) {
				importScenarioFileInput.style.display = "block";
				importScenarioFileInput.click();
			}
			return;
		} else {
			if (importScenarioFileInput)
				importScenarioFileInput.style.display = "none";
		}

		// Map built‑in keys to local preset JSONs
		const keyToUrl = {
			"builtin:modern_2022": "@2022 world invis.json",
			"builtin:ww2_1936": "assets/maps/WW2 Peru Update.json",
			"builtin:ww2_1942": "1942.json",
			"builtin:ww1_1914": "assets/maps/world_war_1__1914_.json",
			"builtin:coldwar_1974": "better_cold_war_preset.json",
			"builtin:coldwar_1948": "1948 (1).json",
			"builtin:france_states": "France_states_preset (2).json",
			"builtin:england_states": "England_states_preset.json",
		};
		const url = keyToUrl[val];
		if (!url) {
			importScenarioSelect.innerHTML =
				'<option value="">Unknown source selection</option>';
			importScenarioSelect.disabled = true;
			return;
		}
		await loadScenarioForCountryImportFromUrl(url);
	});
}

if (importScenarioFileInput) {
	importScenarioFileInput.addEventListener("change", async (e) => {
		const file = e.target.files[0];
		if (!file) return;
		// Remember that we're using a file source so the select can reflect it
		lastImportScenarioKey = "file";
		await loadScenarioForCountryImportFromBlob(file);
	});
}

if (importCountryConfirmBtn) {
	importCountryConfirmBtn.addEventListener("click", () => {
		if (!importScenarioBuffer) {
			alert("Choose a source scenario first.");
			return;
		}
		const cid = selectedImportCountryId || 0;
		if (!cid) {
			alert("Choose a country to import.");
			return;
		}
		importSingleCountryFromScenario(importScenarioBuffer, cid);
		importCountryModal.style.display = "none";
	});
}

if (editorLoadZipBtn) {
	editorLoadZipBtn.addEventListener("click", () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".zip";
		input.onchange = async (e) => {
			const file = e.target.files[0];
			if (!file) return;

			loadingStatus.innerText = "Importing countries from ZIP...";
			loadingOverlay.style.display = "flex";

			try {
				const zip = await JSZip.loadAsync(file);
				const files = Object.values(zip.files).filter(
					(f) => !f.dir && f.name.toLowerCase().endsWith(".json"),
				);
				if (files.length === 0) {
					alert("ZIP file does not contain any .json country files.");
					loadingOverlay.style.display = "none";
					return;
				}

				// Find current max id so we can assign new, non‑conflicting IDs
				let maxId = countryMetadata.reduce(
					(m, c) => (c?.id ? Math.max(m, c.id) : m),
					0,
				);

				for (const zf of files) {
					try {
						const text = await zf.async("text");
						const data = JSON.parse(text);

						if (!data.metadata || !data.cells) continue;

						maxId += 1;
						const newId = maxId;

						const sourceRes = data.gridRes || CONFIG.GRID_RES;
						const meta = {
							id: newId,
							name: data.metadata.name || "Imported Nation",
							color: data.metadata.color || "rgba(150,150,150,0.5)",
							rgba: parseColorToRGBA(
								data.metadata.color || "rgba(150,150,150,0.5)",
							),
							isCustom: true,
							flagUrl: data.metadata.flagUrl || null,
							role: data.metadata.role || "OFFENSE",
							overlordId: data.metadata.overlordId || null,
							bounds: {
								minX: Infinity,
								maxX: -Infinity,
								minY: Infinity,
								maxY: -Infinity,
							},
						};

						if (meta.flagUrl) {
							meta.tempFlag = new Image();
							meta.tempFlag.crossOrigin = "anonymous";
							meta.tempFlag.src = meta.flagUrl;
						}

						countryMetadata[newId - 1] = meta;

						// Map cells to current grid
						const currentRes = CONFIG.GRID_RES;
						data.cells.forEach(([sx, sy]) => {
							if (sourceRes === currentRes) {
								const idx = sy * gridWidth + sx;
								if (idx < worldControlMap.length && landMask[idx] > 0) {
									worldControlMap[idx] = newId;
									meta.bounds.minX = Math.min(meta.bounds.minX, sx);
									meta.bounds.maxX = Math.max(meta.bounds.maxX, sx);
									meta.bounds.minY = Math.min(meta.bounds.minY, sy);
									meta.bounds.maxY = Math.max(meta.bounds.maxY, sy);
								}
							} else {
								const baseLat = sy * sourceRes - 90;
								const baseLng = sx * sourceRes - 180;
								const tIdx = getGridIndex(
									baseLat + sourceRes / 2,
									baseLng + sourceRes / 2,
								);
								if (tIdx !== -1 && landMask[tIdx] > 0) {
									const tx = Math.floor(
										(baseLng + sourceRes / 2 + 180) / currentRes,
									);
									const ty = Math.floor(
										(baseLat + sourceRes / 2 + 90) / currentRes,
									);
									worldControlMap[tIdx] = newId;
									meta.bounds.minX = Math.min(meta.bounds.minX, tx);
									meta.bounds.maxX = Math.max(meta.bounds.maxX, tx);
									meta.bounds.minY = Math.min(meta.bounds.minY, ty);
									meta.bounds.maxY = Math.max(meta.bounds.maxY, ty);
								}
							}
						});
					} catch (innerErr) {
						console.warn("Failed to import one country from ZIP:", innerErr);
					}
				}

				recalculateAllBounds();
				loadingOverlay.style.display = "none";
				influenceLayer.render();
				statusText.innerText = "Imported countries from ZIP.";
			} catch (err) {
				console.error("ZIP import failed:", err);
				alert("Failed to import ZIP of countries.");
				loadingOverlay.style.display = "none";
			}
		};
		input.click();
	});
}

editorFlagLibraryBtn.addEventListener("click", () => {
	openHub("flags");
});

// City tools buttons
if (editorCityNewBtn) {
	editorCityNewBtn.addEventListener("click", () => {
		if (!(gameMode === "EDITOR" || godModeActive)) return;
		cityEditMode = "CREATE";
		statusText.innerText = "City Tools: click on the map to create a new city.";
		cityInspector.style.display = "none";
	});
}

if (editorCityClearBtn) {
	editorCityClearBtn.addEventListener("click", () => {
		if (!(gameMode === "EDITOR" || godModeActive)) return;

		// Robust multi-stage verification for critical deletion
		const verify1 = confirm(
			"SATELLITE WARNING: You are about to clear ALL cities from this scenario. This action is permanent. Proceed?",
		);
		if (!verify1) return;

		const verify2 = confirm(
			"FINAL CONFIRMATION: Are you absolutely sure you want to remove all urban centers?",
		);
		if (!verify2) return;

		cities = [];
		activeTheaterCities = [];
		editingCityId = -1;
		cityInspector.style.display = "none";
		influenceLayer.render();
		statusText.innerText = "CITIDEL WIPE COMPLETE: All urban centers removed.";
		playClickSound();
	});
}

if (leaderboardBtn) {
	leaderboardBtn.addEventListener("click", () => {
		openLeaderboard();
	});
}

if (closeLeaderboardBtn) {
	closeLeaderboardBtn.addEventListener("click", () => {
		leaderboardOverlay.style.display = "none";
	});
}

closeHubBtn.addEventListener("click", () => {
	closeHub();
});

// -------- Item details + comments modal logic --------

export function renderCommentsList(comments) {
	if (!itemCommentsList) return;
	if (!comments || comments.length === 0) {
		itemCommentsList.innerHTML = `<div style="padding:10px; font-size:11px; color:#777; text-align:center;">No comments yet. Be the first to brief this item.</div>`;
		return;
	}

	// Sort newest -> oldest from collection (already newest-first) but keep parent/replies grouped
	const byParent = new Map();
	comments.forEach((c) => {
		const parentId = c.parent_id || null;
		if (!byParent.has(parentId)) byParent.set(parentId, []);
		byParent.get(parentId).push(c);
	});

	const renderThread = (parentId, depth = 0) => {
		const arr = byParent.get(parentId) || [];
		return arr
			.map((c) => {
				const created = new Date(c.created_at).toLocaleString();
				const safeText = (c.text || "")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;");
				const isMine = currentUsername && c.username === currentUsername;
				return `
                <div class="item-comment" data-comment-id="${c.id}" style="padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.05); margin-left:${depth * 12}px;">
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
                        <img src="https://images.websim.com/avatar/${c.username}" style="width:16px; height:16px; border-radius:50%; background:#000;">
                        <span style="font-size:11px; color:#ddd;">${c.username}</span>
                        <span style="font-size:9px; color:#555; margin-left:auto;">${created}</span>
                    </div>
                    <div class="item-comment-text" style="font-size:12px; color:#ccc; white-space:pre-wrap;">${safeText}</div>
                    <div style="margin-top:4px; display:flex; gap:4px;">
                        <button class="mini-btn item-reply-btn" style="padding:2px 6px; font-size:9px;">Reply</button>
                        ${
													isMine
														? `
                            <button class="mini-btn item-edit-btn" style="padding:2px 6px; font-size:9px;">Edit</button>
                            <button class="mini-btn item-delete-btn" style="padding:2px 6px; font-size:9px; background:#c0392b;">Delete</button>
                        `
														: ""
												}
                    </div>
                </div>
                ${renderThread(c.id, depth + 1)}
            `;
			})
			.join("");
	};

	itemCommentsList.innerHTML = renderThread(null);

	// Wire reply buttons
	itemCommentsList.querySelectorAll(".item-reply-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const commentEl = btn.closest(".item-comment");
			if (!commentEl) return;
			currentReplyParentId = commentEl.getAttribute("data-comment-id");
			currentEditingCommentId = null;
			itemReplyIndicator.style.display = "inline-block";
			itemReplyIndicator.textContent = "Replying...";
			itemCancelReplyBtn.style.display = "inline-block";
			itemCommentSubmit.textContent = "Post";
			itemCommentInput.focus();
		});
	});

	// Wire edit buttons (only for own comments)
	itemCommentsList.querySelectorAll(".item-edit-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const commentEl = btn.closest(".item-comment");
			if (!commentEl) return;
			const id = commentEl.getAttribute("data-comment-id");
			const comment = comments.find((c) => c.id === id);
			if (!comment || comment.username !== currentUsername) return;
			currentEditingCommentId = id;
			currentReplyParentId = comment.parent_id || null;
			const textEl = commentEl.querySelector(".item-comment-text");
			const currentText = textEl ? textEl.textContent : comment.text || "";
			itemCommentInput.value = currentText;
			itemReplyIndicator.style.display = "inline-block";
			itemReplyIndicator.textContent = "Editing...";
			itemCancelReplyBtn.style.display = "inline-block";
			itemCommentSubmit.textContent = "Save";
			itemCommentInput.focus();
		});
	});

	// Wire delete buttons (only for own comments)
	itemCommentsList.querySelectorAll(".item-delete-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			const commentEl = btn.closest(".item-comment");
			if (!commentEl) return;
			const id = commentEl.getAttribute("data-comment-id");
			const comment = comments.find((c) => c.id === id);
			if (!comment || comment.username !== currentUsername) return;
			if (!confirm("Delete this comment?")) return;
			(async () => {
				try {
					await room.collection("hub_comment_v1").delete(id);
				} catch (e) {
					console.error("Failed to delete comment", e);
					alert("Failed to delete comment.");
				}
			})();
		});
	});
}

export async function openItemModal(type, item) {
	currentCommentItemType = type;
	currentCommentItemId = item.id;
	currentReplyParentId = null;
	currentEditingCommentId = null;
	if (commentsUnsubscribe) {
		commentsUnsubscribe();
		commentsUnsubscribe = null;
	}

	// Title / desc / preview
	itemModalTitle.textContent = (item.name || "Item Details").toUpperCase();
	const desc = item.description || item.desc || "";
	itemModalDesc.textContent = desc;

	const authorEl = document.getElementById("item-modal-author-name");
	if (authorEl) {
		authorEl.textContent = item.username || "Intel Report";
	}

	if (item.previewUrl || item.flagUrl) {
		itemModalPreview.src = item.previewUrl || item.flagUrl;
		itemModalPreview.style.display = "block";
	} else {
		itemModalPreview.style.display = "none";
	}

	// Configure big-card actions for all item types
	if (itemModalActions) {
		const canImport = gameMode === "EDITOR" || godModeActive;
		const itemModalDeleteBtn = document.getElementById("item-modal-delete");
		const isOwner = currentUsername && item.username === currentUsername;

		if (itemModalDeleteBtn) {
			itemModalDeleteBtn.style.display = isOwner ? "inline-flex" : "none";
			itemModalDeleteBtn.onclick = () => {
				if (type === "scenario") window.deleteScenario(item.id);
				else if (type === "country") window.deleteCountry(item.id);
				else if (type === "flag") window.deleteFlag(item.id);
				itemCommentModal.style.display = "none";
			};
		}

		if (type === "scenario") {
			// Play / Remix a scenario
			itemModalActions.style.display = "flex";
			if (itemModalPlayBtn) {
				itemModalPlayBtn.style.display = "inline-flex";
				itemModalPlayBtn.textContent = "Play";
				itemModalPlayBtn.onclick = () => {
					if (window.playFromHub) {
						window.playFromHub(
							item.blobUrl,
							item.id,
							item.name || "",
							item.username || "",
						);
						itemCommentModal.style.display = "none";
						closeHub();
					}
				};
			}
			if (itemModalRemixBtn) {
				itemModalRemixBtn.style.display = "inline-flex";
				itemModalRemixBtn.textContent = "Remix";
				itemModalRemixBtn.onclick = () => {
					if (window.remixFromHub) {
						window.remixFromHub(
							item.blobUrl,
							item.id,
							item.name || "",
							item.username || "",
						);
						itemCommentModal.style.display = "none";
						closeHub();
					}
				};
			}
		} else if (type === "country") {
			// Import a country into the current editor map
			itemModalActions.style.display = canImport || isOwner ? "flex" : "none";
			if (itemModalPlayBtn) {
				itemModalPlayBtn.style.display = canImport ? "inline-flex" : "none";
				itemModalPlayBtn.textContent = "Import";
				itemModalPlayBtn.onclick = () => {
					if (window.importFromLibrary) {
						window.importFromLibrary(item.id);
						itemCommentModal.style.display = "none";
					}
				};
			}
			if (itemModalRemixBtn) {
				itemModalRemixBtn.style.display = "none";
				itemModalRemixBtn.onclick = null;
			}
		} else if (type === "flag") {
			// Use a flag from the library on the currently selected country
			itemModalActions.style.display = canImport || isOwner ? "flex" : "none";
			if (itemModalPlayBtn) {
				itemModalPlayBtn.style.display = canImport ? "inline-flex" : "none";
				itemModalPlayBtn.textContent = "Use Flag";
				itemModalPlayBtn.onclick = () => {
					if (window.importFlagFromLibrary) {
						window.importFlagFromLibrary(item.id);
						itemCommentModal.style.display = "none";
					}
				};
			}
			if (itemModalRemixBtn) {
				itemModalRemixBtn.style.display = "none";
				itemModalRemixBtn.onclick = null;
			}
		} else {
			itemModalActions.style.display = isOwner ? "flex" : "none";
			if (itemModalPlayBtn) itemModalPlayBtn.style.display = "none";
			if (itemModalRemixBtn) itemModalRemixBtn.style.display = "none";
		}
	}

	// Clear composer
	itemCommentInput.value = "";
	itemReplyIndicator.style.display = "none";
	itemCancelReplyBtn.style.display = "none";
	itemCommentSubmit.textContent = "Post";

	// Subscribe to comments for this item (using records)
	try {
		const coll = room.collection("hub_comment_v1").filter({
			item_type: type,
			item_id: item.id,
		});
		commentsUnsubscribe = coll.subscribe((records) => {
			renderCommentsList(records || []);
		});
		// Initial render
		renderCommentsList(coll.getList());
	} catch (e) {
		console.warn("Comment subscription failed", e);
		renderCommentsList([]);
	}

	itemCommentModal.style.display = "flex";
}

// -------- Global Chat Logic --------

export function renderGlobalChatList(messages) {
	if (!globalChatList) return;
	if (!messages || messages.length === 0) {
		globalChatList.innerHTML = `<div style="text-align:center; font-size:11px; color:#666; padding:16px;">No messages yet. Say hello!</div>`;
		return;
	}
	// oldest at top
	const sorted = messages
		.slice()
		.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
	globalChatList.innerHTML = sorted
		.map((m) => {
			const created = new Date(m.created_at).toLocaleTimeString();
			const safeText = (m.text || "")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
			const isMine = currentUsername && m.username === currentUsername;
			return `
            <div style="margin-bottom:6px; font-size:12px; ${isMine ? "text-align:right;" : ""}">
                <div style="display:flex; ${isMine ? "flex-direction:row-reverse;" : ""} align-items:center; gap:6px;">
                    <img src="https://images.websim.com/avatar/${m.username}" style="width:16px; height:16px; border-radius:50%; background:#000;">
                    <span style="font-size:11px; color:#ddd;">${m.username}</span>
                    <span style="font-size:9px; color:#555;">${created}</span>
                </div>
                <div style="margin-top:2px; color:#ccc; white-space:pre-wrap;">${safeText}</div>
            </div>
        `;
		})
		.join("");
	globalChatList.scrollTop = globalChatList.scrollHeight;
}

export async function _openGlobalChat() {
	if (!globalChatModal) return;
	if (!room) {
		try {
			await initMultiplayer();
		} catch (e) {
			console.warn("Failed to init multiplayer for chat", e);
		}
	}
	globalChatModal.style.display = "flex";
	if (room && !globalChatUnsubscribe) {
		const coll = room.collection("global_chat_v1");
		globalChatUnsubscribe = coll.subscribe((records) => {
			renderGlobalChatList(records || []);
		});
		renderGlobalChatList(coll.getList());
	}
}

if (globalChatClose) {
	globalChatClose.addEventListener("click", () => {
		globalChatModal.style.display = "none";
	});
}

if (globalChatSend) {
	globalChatSend.addEventListener("click", async () => {
		if (!room || !globalChatInput) return;
		const text = globalChatInput.value.trim();
		if (!text) return;
		try {
			await room.collection("global_chat_v1").create({
				text,
			});
			globalChatInput.value = "";
		} catch (e) {
			console.error("Failed to send chat message", e);
		}
	});
}

if (globalChatInput) {
	globalChatInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (globalChatSend) globalChatSend.click();
		}
	});
}

itemCommentSubmit.addEventListener("click", async () => {
	if (!currentCommentItemType || !currentCommentItemId) return;
	const text = itemCommentInput.value.trim();
	if (!text) return;
	try {
		if (currentEditingCommentId) {
			// Edit existing comment
			await room.collection("hub_comment_v1").update(currentEditingCommentId, {
				text,
			});
		} else {
			// New comment or reply
			await room.collection("hub_comment_v1").create({
				item_type: currentCommentItemType,
				item_id: currentCommentItemId,
				parent_id: currentReplyParentId || null,
				text,
			});
		}
		itemCommentInput.value = "";
		currentReplyParentId = null;
		currentEditingCommentId = null;
		itemReplyIndicator.style.display = "none";
		itemCancelReplyBtn.style.display = "none";
		itemCommentSubmit.textContent = "Post";
	} catch (e) {
		console.error("Failed to post comment", e);
		alert("Failed to post comment. Try again.");
	}
});

itemCancelReplyBtn.addEventListener("click", () => {
	currentReplyParentId = null;
	currentEditingCommentId = null;
	itemReplyIndicator.style.display = "none";
	itemCancelReplyBtn.style.display = "none";
	itemCommentSubmit.textContent = "Post";
});

closeItemModalBtn.addEventListener("click", () => {
	itemCommentModal.style.display = "none";
	if (commentsUnsubscribe) {
		commentsUnsubscribe();
		commentsUnsubscribe = null;
	}
});

editorShareBtn.addEventListener("click", () => {
	if (countryMetadata.length < 2) {
		alert("Your map must have at least 2 nations to be playable.");
		return;
	}
	uploadNameInput.value = "";
	uploadDescInput.value = "";
	uploadDetailsModal.style.display = "flex";
});

cancelUploadBtn.addEventListener("click", () => {
	uploadDetailsModal.style.display = "none";
});

confirmUploadBtn.addEventListener("click", async () => {
	const name = uploadNameInput.value.trim() || "Untitled Scenario";
	const desc = uploadDescInput.value.trim();

	uploadDetailsModal.style.display = "none";
	loadingStatus.innerText = "Uploading Scenario...";
	loadingOverlay.style.display = "flex";

	try {
		// 1. Generate Preview Snapshot
		let previewUrl = null;
		if (influenceLayer?._container) {
			influenceLayer._isCapturing = true;
			influenceLayer.render();
			const canvas = influenceLayer._container;
			const previewBlob = await new Promise((resolve) =>
				canvas.toBlob(resolve, "image/jpeg", 0.8),
			);
			influenceLayer._isCapturing = false;
			influenceLayer.render();
			if (previewBlob) {
				const previewFile = new File([previewBlob], "preview.jpg", {
					type: "image/jpeg",
				});
				previewUrl = await websim.upload(previewFile);
			}
		}

		// 2. Generate and Upload JSON
		const saveData = generatePresetData(name);
		const blob = new Blob([JSON.stringify(saveData)], {
			type: "application/json",
		});
		const file = new File([blob], "scenario.json", {
			type: "application/json",
		});
		const blobUrl = await websim.upload(file);

		// Determine if this is a remix
		const _currentUser = await window.websim.getCurrentUser();
		let remixedFromId = null;
		let remixedFromName = null;

		// If current scenario context exists, it's a remix
		if (currentScenarioContext) {
			remixedFromId = currentScenarioContext.id;
			remixedFromName = currentScenarioContext.name;
		}

		// 3. Create Persistent Record
		await room.collection("scenario_v1").create({
			name: name,
			description: desc,
			previewUrl: previewUrl,
			blobUrl: blobUrl,
			remixed_from_id: remixedFromId,
			remixed_from_name: remixedFromName,
		});

		loadingOverlay.style.display = "none";
		alert("Scenario uploaded successfully to the hub!");
	} catch (e) {
		console.error(e);
		alert("Failed to upload scenario.");
		loadingOverlay.style.display = "none";
	}
});

cancelEditorChoice.onclick = () => {
	editorChoiceModal.style.display = "none";
};

choiceExternalEditor.onclick = () => {
	window.open(
		"https://websim.com/@thepineguy/modern-wars-alternative-editor",
		"_blank",
	);
	editorChoiceModal.style.display = "none";
};

choiceIngameEditor.onclick = () => {
	editorChoiceModal.style.display = "none";
	editorSourceModal.style.display = "flex";
};

cancelSourceChoice.onclick = () => {
	editorSourceModal.style.display = "none";
	editorChoiceModal.style.display = "flex";
};

choiceSourceEarth.onclick = () => {
	isCustomTerrain = false;
	editorSourceModal.style.display = "none";
	initAudio();
	gameMode = "EDITOR";
	gameState = "EDITOR_ACTIVE";
	currentScenarioContext = null;
	activeScenarioId = null;
	editorUpdateBtn.style.display = "none";
	mainMenu.style.display = "none";
	mapUi.style.display = "flex";
	editorToolbox.style.display = "flex";

	// Ensure grid is ready
	if (!worldControlMap) {
		gridWidth = Math.ceil(360 / CONFIG.GRID_RES);
		gridHeight = Math.ceil(180 / CONFIG.GRID_RES);
		worldControlMap = new Uint16Array(gridWidth * gridHeight);
		deJureMap = new Uint16Array(gridWidth * gridHeight);
		provinceMap = new Int32Array(gridWidth * gridHeight);
		occupationMap = new Float32Array(gridWidth * gridHeight);
		initSideInfluenceMaps();
		primaryOccupierMap = new Uint16Array(gridWidth * gridHeight);
		landMask = new Uint8Array(gridWidth * gridHeight);
		terrainMask = new Float32Array(gridWidth * gridHeight);
		flagProcessedBuffer = new Int32Array(gridWidth * gridHeight);
	}

	loadCities();
	statusText.innerText = "Map Editor (Alpha)";
	setupPanel.style.display = "none";
	resetBtn.style.display = "block";
	editorUnclaimBtn.style.display = "block";

	// Load real‑earth geography without establishing countries
	const mapRes = document.getElementById("map-res-select").value;
	const geoUrl = `${CONFIG.GEOJSON_BASE}${mapRes}/cultural/ne_${mapRes}_admin_0_countries.json`;
	loadCountries(geoUrl, true);

	if (getCookie("mw_editor_tutorial_finished") !== "true") {
		startTutorial(editorTutorialSteps, "mw_editor_tutorial_finished");
	}

	updateRestartVisibility();
};

choiceSourceBlank.onclick = () => {
	document.getElementById("blank-size-modal").style.display = "flex";
};

document.getElementById("cancel-blank-size-btn").onclick = () => {
	document.getElementById("blank-size-modal").style.display = "none";
};

document.getElementById("confirm-blank-size-btn").onclick = () => {
	const w =
		parseFloat(document.getElementById("blank-width-input").value) || 360;
	const h =
		parseFloat(document.getElementById("blank-height-input").value) || 180;

	document.getElementById("blank-size-modal").style.display = "none";
	isCustomTerrain = true;
	editorSourceModal.style.display = "none";
	initAudio();
	gameMode = "EDITOR";
	gameState = "EDITOR_ACTIVE";
	currentScenarioContext = null;
	activeScenarioId = null;
	editorUpdateBtn.style.display = "none";
	mainMenu.style.display = "none";
	mapUi.style.display = "flex";
	editorToolbox.style.display = "flex";

	// Ensure grid is ready
	if (!worldControlMap) {
		initializeEngine();
	}

	// Initialize Blank Canvas State
	worldControlMap.fill(0);
	deJureMap.fill(0);
	landMask.fill(0);
	provinceMap.fill(0);
	terrainMask.fill(0);
	cities = [];
	activeTheaterCities = [];
	countryMetadata = [];

	// Custom World Size Logic:
	// If w or h are smaller than full world, we restrict the view and paintable area
	if (w < 360 || h < 180) {
		const halfW = w / 2;
		const halfH = h / 2;
		const bounds = [
			[-halfH, -halfW],
			[halfH, halfW],
		];
		map.setMaxBounds(bounds);
		map.fitBounds(bounds);

		// Block painting outside these bounds by keeping landMask at 0 (Ocean) for those cells
		// Note: The paintAt logic already checks landMask[idx] > 0 for country painting.
		// We'll also update terrain brush to respect these bounds if we really wanted to be strict.
	} else {
		map.setMaxBounds(null);
	}

	// Switch to Simplified View for better "blank canvas" painting feel (temporarily)
	setImageryProvider("wargames", false);
	if (disableCountryGradientCheckbox) {
		disableCountryGradientCheckbox.checked = true;
		disableCountryGradient = true;
	}

	statusText.innerText = "Blank Canvas: Draw Terrain";
	setupPanel.style.display = "none";
	resetBtn.style.display = "block";

	// Instantly jump to Page 3 tools so they see the terrain brush
	updateEditorToolPage(3);

	influenceLayer.render();
	updateRestartVisibility();
};

minimizeSetupBtn.onclick = (e) => {
	e.stopPropagation();
	const isMinimized = setupPanel.classList.toggle("minimized");
	minimizeSetupBtn.innerText = isMinimized ? "+" : "−";
};

minimizeStatsBtn.onclick = (e) => {
	e.stopPropagation();
	const isMinimized = statsPanel.classList.toggle("minimized");
	minimizeStatsBtn.innerText = isMinimized ? "+" : "−";
};

minimizeStatusBtn.onclick = (e) => {
	e.stopPropagation();
	const isMinimized = document
		.getElementById("game-status")
		.classList.toggle("minimized");
	minimizeStatusBtn.innerText = isMinimized ? "+" : "−";
};

// Keep simulation running when tab is not focused (background ticking)
document.addEventListener("visibilitychange", () => {
	if (document.hidden) {
		// Stop visual loop and start a lightweight background tick loop
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		if (!backgroundTickId && gameState === "SIMULATING") {
			backgroundTickId = setInterval(() => {
				if (gameState !== "SIMULATING") return;
				// Advance simulation based on simSpeed, but skip rendering/UI-heavy work
				frameAccumulator += simSpeed;
				while (frameAccumulator >= 1) {
					const warEnded = performSimulationTick();
					if (warEnded) {
						frameAccumulator = 0;
						break;
					}
					frameAccumulator -= 1;
				}
				// Advance in-game date based on background tick interval
				tickGameTime(100);
				simFrameCount++;
			}, 100); // ~10 ticks per second while unfocused
		}
	} else {
		// Back to foreground: stop background loop and resume visual loop
		if (backgroundTickId) {
			clearInterval(backgroundTickId);
			backgroundTickId = null;
		}
		if (gameState === "SIMULATING") {
			if (animationFrameId !== null) {
				cancelAnimationFrame(animationFrameId);
			}
			animationFrameId = requestAnimationFrame(updateLoop);
		}
	}
});
