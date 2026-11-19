"""Chemins des polices libres pour les entrées de test (DejaVu, Google Fonts), recherche portable."""
import glob, os, urllib.parse, urllib.request


def find(*names):
    dirs = []
    try:
        import matplotlib
        dirs.append(os.path.join(os.path.dirname(matplotlib.__file__), 'mpl-data', 'fonts', 'ttf'))
    except Exception:
        pass
    dirs += ['/usr/share/fonts/truetype/dejavu', os.path.expanduser('~/.fonts'), '/usr/local/share/fonts']
    for n in names:
        for d in dirs:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return p
    return os.path.join(dirs[0], names[0])


GOOGLE_URL = 'https://raw.githubusercontent.com/google/fonts/main/'
GOOGLE_DIRS = ('ofl', 'apache')


def google(folder, *names):
    """Trouve une police Google : répertoire système (GOOGLE_FONTS ou install par défaut), sinon téléchargée en cache."""
    sysdirs = [
        os.path.join(os.environ.get('GOOGLE_FONTS', '/usr/share/fonts/truetype/sand-box/google'), folder),
        os.path.join('/tmp/google-fonts', folder),
    ]
    for n in names:
        for d in sysdirs:
            p = sorted(glob.glob(os.path.join(d, n.replace('[', '?').replace(']', '?'))))
            if p:
                return p[0]
    d = sysdirs[-1]
    os.makedirs(d, exist_ok=True)
    for n in names:
        p = os.path.join(d, n)
        if os.path.exists(p):
            return p
        err = None
        for root in GOOGLE_DIRS:
            url = GOOGLE_URL + '{}/'.format(root) + urllib.parse.quote(folder.lower()) + '/' + urllib.parse.quote(n)
            try:
                urllib.request.urlretrieve(url, p)
                return p
            except Exception as e:
                err = e
        raise SystemExit(f'police {folder}/{n} introuvable ({err}) : installez-la dans ~/.fonts ou définissez GOOGLE_FONTS')
    raise SystemExit('aucune police demandée')
