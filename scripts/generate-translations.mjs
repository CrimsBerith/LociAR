import { writeFileSync } from 'node:fs';

const translations = {
  "Gerçek mekânlara bağlı hikâyeler.": {
    en: "Stories tied to real places.",
    "zh-Hans": "与真实地点相连的故事。",
    hi: "वास्तविक स्थानों से जुड़ी कहानियाँ।",
    es: "Historias vinculadas a lugares reales.",
    fr: "Des histoires liées à des lieux réels.",
    ar: "قصص مرتبطة بأماكن حقيقية.",
    bn: "বাস্তব স্থানের সাথে সংযুক্ত গল্প।",
    pt: "Histórias ligadas a lugares reais.",
    ru: "Истории, привязанные к реальным местам.",
    de: "Geschichten, die an reale Orte gebunden sind.",
    ja: "実在の場所と結びついたストーリー。"
  },
  "Devam ederek gizlilik ve topluluk kurallarını kabul edersiniz.": {
    en: "By continuing you accept the privacy policy and community rules.",
    "zh-Hans": "继续操作即表示您同意隐私政策和社区守则。",
    hi: "जारी रखकर आप गोपनीयता नीति और सामुदायिक नियमों को स्वीकार करते हैं।",
    es: "Al continuar, aceptas la política de privacidad y las normas de la comunidad.",
    fr: "En continuant, vous acceptez la politique de confidentialité et les règles de la communauté.",
    ar: "بالمتابعة، فإنك توافق على سياسة الخصوصية وقواعد المجتمع.",
    bn: "চালিয়ে যাওয়ার মাধ্যমে আপনি গোপনীয়তা নীতি এবং সম্প্রদায়ের নিয়মাবলী গ্রহণ করছেন।",
    pt: "Ao continuar, você aceita a política de privacidade e as regras da comunidade.",
    ru: "Продолжая, вы принимаете политику конфиденциальности и правила сообщества.",
    de: "Indem Sie fortfahren, akzeptieren Sie die Datenschutzrichtlinie und die Community-Regeln.",
    ja: "続行すると、プライバシーポリシーとコミュニティガイドラインに同意したことになります。"
  },
  "veya": {
    en: "or",
    "zh-Hans": "或",
    hi: "या",
    es: "o",
    fr: "ou",
    ar: "أو",
    bn: "বা",
    pt: "ou",
    ru: "или",
    de: "oder",
    ja: "または"
  },
  "Şifremi unuttum": {
    en: "Forgot password",
    "zh-Hans": "忘记密码",
    hi: "पासवर्ड भूल गए",
    es: "Olvidé mi contraseña",
    fr: "Mot de passe oublié",
    ar: "نسيت كلمة المرور",
    bn: "পাসওয়ার্ড ভুলে গেছেন",
    pt: "Esqueci minha senha",
    ru: "Забыли пароль",
    de: "Passwort vergessen",
    ja: "パスワードをお忘れですか"
  },
  "Kayıttan sonra e-posta adresine gönderilen bağlantıyla hesabını doğrula.": {
    en: "After signing up, verify your account with the link sent to your email.",
    "zh-Hans": "注册后，请使用发送到您电子邮箱的链接验证账户。",
    hi: "साइन अप करने के बाद, अपने ईमेल पर भेजे गए लिंक से अपना खाता सत्यापित करें।",
    es: "Después de registrarte, verifica tu cuenta con el enlace enviado a tu correo.",
    fr: "Après votre inscription, vérifiez votre compte via le lien envoyé à votre e-mail.",
    ar: "بعد التسجيل، يرجى تأكيد حسابك عبر الرابط المرسل إلى بريدك الإلكتروني.",
    bn: "সাইন আপ করার পরে, আপনার ইমেলে পাঠানো লিঙ্কটি দিয়ে আপনার অ্যাকাউন্ট যাচাই করুন।",
    pt: "Após o cadastro, confirme sua conta com o link enviado para o seu e-mail.",
    ru: "После регистрации подтвердите учетную запись по ссылке, отправленной на вашу почту.",
    de: "Bestätigen Sie Ihr Konto nach der Registrierung über den Link in Ihrer E-Mail.",
    ja: "登録後、メールに届いたリンクからアカウントを確認してください。"
  },
  "E-posta Doğrulaması": {
    en: "Email Verification",
    "zh-Hans": "电子邮件验证",
    hi: "ईमेल सत्यापन",
    es: "Verificación de correo",
    fr: "Vérification de l'e-mail",
    ar: "التحقق من البريد الإلكتروني",
    bn: "ইমেল যাচাইকরণ",
    pt: "Verificação de e-mail",
    ru: "Подтверждение почты",
    de: "E-Mail-Verifizierung",
    ja: "メール確認"
  },
  "Yapıştır": {
    en: "Paste",
    "zh-Hans": "粘贴",
    hi: "पेस्ट करें",
    es: "Pegar",
    fr: "Coller",
    ar: "لصق",
    bn: "পেস্ট করুন",
    pt: "Colar",
    ru: "Вставить",
    de: "Einsetzen",
    ja: "ペースト"
  },
  "İçerik": {
    en: "Content",
    "zh-Hans": "内容",
    hi: "सामग्री",
    es: "Contenido",
    fr: "Contenu",
    ar: "المحتوى",
    bn: "বিষয়বস্তু",
    pt: "Conteúdo",
    ru: "Контент",
    de: "Inhalt",
    ja: "コンテンツ"
  },
  "Caption veya geçerli bir sosyal bağlantı ekle.": {
    en: "Add a caption or a valid social link.",
    "zh-Hans": "添加说明或有效的社交链接。",
    hi: "कैप्शन या मान्य सोशल लिंक जोड़ें।",
    es: "Añade un texto o un enlace social válido.",
    fr: "Ajoutez une légende ou un lien social valide.",
    ar: "أضف تعليقًا أو رابط تواصل اجتماعي صالحًا.",
    bn: "একটি ক্যাপশন বা বৈধ সোশ্যাল লিঙ্ক যোগ করুন।",
    pt: "Adicione uma legenda ou um link social válido.",
    ru: "Добавьте подпись или действительную ссылку на соцсеть.",
    de: "Fügen Sie eine Bildunterschrift oder einen gültigen Social-Link hinzu.",
    ja: "キャプションまたは有効なソーシャルリンクを追加してください。"
  },
  "Giriş yap": {
    en: "Sign in",
    "zh-Hans": "登录",
    hi: "साइन इन करें",
    es: "Iniciar sesión",
    fr: "Se connecter",
    ar: "تسجيل الدخول",
    bn: "সাইন ইন করুন",
    pt: "Entrar",
    ru: "Войти",
    de: "Anmelden",
    ja: "サインイン"
  },
  "Kaydol": {
    en: "Sign up",
    "zh-Hans": "注册",
    hi: "साइन अप करें",
    es: "Registrarse",
    fr: "S'inscrire",
    ar: "إنشاء حساب",
    bn: "সাইন আপ করুন",
    pt: "Cadastrar",
    ru: "Регистрация",
    de: "Registrieren",
    ja: "登録"
  },
  "Çıkış yap": {
    en: "Sign out",
    "zh-Hans": "退出登录",
    hi: "साइन आउट करें",
    es: "Cerrar sesión",
    fr: "Se déconnecter",
    ar: "تسجيل الخروج",
    bn: "সাইন আউট করুন",
    pt: "Sair",
    ru: "Выйти",
    de: "Abmelden",
    ja: "サインアウト"
  },
  "Hesabı sil": {
    en: "Delete account",
    "zh-Hans": "删除账户",
    hi: "खाता हटाएं",
    es: "Eliminar cuenta",
    fr: "Supprimer le compte",
    ar: "حذف الحساب",
    bn: "অ্যাকাউন্ট মুছুন",
    pt: "Excluir conta",
    ru: "Удалить аккаунт",
    de: "Konto löschen",
    ja: "アカウントを削除"
  },
  "Harita": {
    en: "Map",
    "zh-Hans": "地图",
    hi: "मानचित्र",
    es: "Mapa",
    fr: "Carte",
    ar: "الخريطة",
    bn: "মানচিত্র",
    pt: "Mapa",
    ru: "Карта",
    de: "Karte",
    ja: "マップ"
  },
  "Keşfet": {
    en: "Discover",
    "zh-Hans": "探索",
    hi: "खोजें",
    es: "Descubrir",
    fr: "Découvrir",
    ar: "استكشف",
    bn: "আবিষ্কার করুন",
    pt: "Explorar",
    ru: "Обзор",
    de: "Entdecken",
    ja: "見つける"
  },
  "Paylaş": {
    en: "Share",
    "zh-Hans": "分享",
    hi: "साझा करें",
    es: "Compartir",
    fr: "Partager",
    ar: "مشاركة",
    bn: "শেয়ার করুন",
    pt: "Compartilhar",
    ru: "Поделиться",
    de: "Teilen",
    ja: "共有"
  },
  "Profil": {
    en: "Profile",
    "zh-Hans": "个人资料",
    hi: "प्रोफ़ाइल",
    es: "Perfil",
    fr: "Profil",
    ar: "الملف الشخصي",
    bn: "প্রোফাইল",
    pt: "Perfil",
    ru: "Профиль",
    de: "Profil",
    ja: "プロフィール"
  },
  "Yenile": {
    en: "Refresh",
    "zh-Hans": "刷新",
    hi: "रीफ़्रेश करें",
    es: "Actualizar",
    fr: "Actualiser",
    ar: "تحديث",
    bn: "রিফ্রেশ করুন",
    pt: "Atualizar",
    ru: "Обновить",
    de: "Aktualisieren",
    ja: "更新"
  },
  "Yorumlar": {
    en: "Comments",
    "zh-Hans": "评论",
    hi: "टिप्पणियाँ",
    es: "Comentarios",
    fr: "Commentaires",
    ar: "التعليقات",
    bn: "মন্তব্য",
    pt: "Comentários",
    ru: "Комментарии",
    de: "Kommentare",
    ja: "コメント"
  },
  "Beğeni": {
    en: "Likes",
    "zh-Hans": "点赞",
    hi: "पसंद",
    es: "Me gusta",
    fr: "J'aime",
    ar: "الإعجابات",
    bn: "লাইক",
    pt: "Curtidas",
    ru: "Отметки «Нравится»",
    de: "Gefällt mir",
    ja: "いいね"
  },
  "Yüzeye sabitle": {
    en: "Anchor to surface",
    "zh-Hans": "固定到表面",
    hi: "सतह पर स्थिर करें",
    es: "Fijar a la superficie",
    fr: "Ancrer à la surface",
    ar: "تثبيت على السطح",
    bn: "পৃষ্ঠে নোঙ্গর করুন",
    pt: "Fixar na superfície",
    ru: "Закрепить на поверхности",
    de: "Auf Oberfläche fixieren",
    ja: "面に固定"
  },
  "Kapat": {
    en: "Close",
    "zh-Hans": "关闭",
    hi: "बंद करें",
    es: "Cerrar",
    fr: "Fermer",
    ar: "إغلاق",
    bn: "বন্ধ করুন",
    pt: "Fechar",
    ru: "Закрыть",
    de: "Schließen",
    ja: "閉じる"
  },
  "İptal": {
    en: "Cancel",
    "zh-Hans": "取消",
    hi: "रद्द करें",
    es: "Cancelar",
    fr: "Annuler",
    ar: "إلغاء",
    bn: "বাতিল",
    pt: "Cancelar",
    ru: "Отмена",
    de: "Abbrechen",
    ja: "キャンセル"
  },
  "Kaydet": {
    en: "Save",
    "zh-Hans": "保存",
    hi: "सहेजें",
    es: "Guardar",
    fr: "Enregistrer",
    ar: "حفظ",
    bn: "সংরক্ষণ করুন",
    pt: "Salvar",
    ru: "Сохранить",
    de: "Speichern",
    ja: "保存"
  },
  "Diğer seçenekler": {
    en: "More options",
    "zh-Hans": "更多选项",
    hi: "अधिक विकल्प",
    es: "Más opciones",
    fr: "Plus d'options",
    ar: "المزيد من الخيارات",
    bn: "আরও বিকল্প",
    pt: "Mais opções",
    ru: "Другие варианты",
    de: "Weitere Optionen",
    ja: "その他のオプション"
  },
  "Yorumu gönder": {
    en: "Send comment",
    "zh-Hans": "发送评论",
    hi: "टिप्पणी भेजें",
    es: "Enviar comentario",
    fr: "Envoyer le commentaire",
    ar: "إرسال التعليق",
    bn: "মন্তব্য পাঠান",
    pt: "Enviar comentário",
    ru: "Отправить комментарий",
    de: "Kommentar senden",
    ja: "コメントを送信"
  },
  "Rapor et": {
    en: "Report",
    "zh-Hans": "举报",
    hi: "रिपोर्ट करें",
    es: "Reportar",
    fr: "Signaler",
    ar: "إبلاغ",
    bn: "রিপোর্ট করুন",
    pt: "Denunciar",
    ru: "Пожаловаться",
    de: "Melden",
    ja: "通報"
  },
  "Engelle": {
    en: "Block",
    "zh-Hans": "屏蔽",
    hi: "ब्लॉक करें",
    es: "Bloquear",
    fr: "Bloquer",
    ar: "حظر",
    bn: "ব্লক করুন",
    pt: "Bloquear",
    ru: "Заблокировать",
    de: "Blockieren",
    ja: "ブロック"
  },
  "Paylaşımı görüntüle": {
    en: "View post",
    "zh-Hans": "查看动态",
    hi: "पोस्ट देखें",
    es: "Ver publicación",
    fr: "Voir la publication",
    ar: "عرض المنشور",
    bn: "পোস্ট দেখুন",
    pt: "Ver publicação",
    ru: "Посмотреть публикацию",
    de: "Beitrag anzeigen",
    ja: "投稿を見る"
  },
  "Konum izni gerekiyor": {
    en: "Location permission required",
    "zh-Hans": "需要位置权限",
    hi: "स्थान अनुमति आवश्यक है",
    es: "Se requiere permiso de ubicación",
    fr: "Autorisation de localisation requise",
    ar: "مطلوب إذن الموقع",
    bn: "অবস্থানের অনুমতি প্রয়োজন",
    pt: "Permissão de localização necessária",
    ru: "Требуется доступ к геолокации",
    de: "Standortberechtigung erforderlich",
    ja: "位置情報の許可が必要です"
  },
  "Kamera izni gerekiyor": {
    en: "Camera permission required",
    "zh-Hans": "需要相机权限",
    hi: "कैमरा अनुमति आवश्यक है",
    es: "Se requiere permiso de cámara",
    fr: "Autorisation de la caméra requise",
    ar: "مطلوب إذن الكاميرا",
    bn: "ক্যামেরার অনুমতি প্রয়োজন",
    pt: "Permissão de câmera necessária",
    ru: "Требуется доступ к камере",
    de: "Kameraberechtigung erforderlich",
    ja: "カメラの許可が必要です"
  }
};

const catalog = {
  sourceLanguage: "tr",
  version: "1.0",
  strings: {}
};

for (const [key, langMap] of Object.entries(translations)) {
  catalog.strings[key] = {
    extractionState: "manual",
    localizations: {}
  };
  for (const [lang, val] of Object.entries(langMap)) {
    catalog.strings[key].localizations[lang] = {
      stringUnit: {
        state: "translated",
        value: val
      }
    };
  }
}

writeFileSync(
  '/Users/khankartal/Desktop/MAC APPS NEARLY FINISHED/loci/LociAR/LociAR/Resources/Localizable.xcstrings',
  JSON.stringify(catalog, null, 2) + '\n',
  'utf8'
);
console.log(`Generated Localizable.xcstrings with ${Object.keys(translations).length} keys and 11 target languages (total 12 including Turkish base).`);
