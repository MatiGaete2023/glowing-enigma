#!/usr/bin/env python3
"""Verifica que A_quineladel44_SAFE.html y B_quinelacsm_SAFE.html sean idénticos
salvo en la línea ROOM_DOC y el bloque APP {...}. Falla (exit 1) si difieren
en cualquier otra parte, para que un arreglo no quede vivo solo en un archivo.

Uso:  python3 tools/check_ab.py
"""
import re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'A_quineladel44_SAFE.html')
B = os.path.join(ROOT, 'B_quinelacsm_SAFE.html')

def strip_identity(src):
    # elimina la línea ROOM_DOC y el bloque APP = {...}; para comparar el resto
    src = re.sub(r"const ROOM_DOC = '[^']*';", "const ROOM_DOC = '<ROOM>';", src, count=1)
    src = re.sub(r"const APP = \{.*?\n\};", "const APP = {<IDENTITY>};", src, count=1, flags=re.S)
    return src

def main():
    a = open(A, encoding='utf-8').read()
    b = open(B, encoding='utf-8').read()
    na, nb = strip_identity(a), strip_identity(b)
    if na == nb:
        print('OK: A y B son idénticos salvo ROOM_DOC y el bloque APP.')
        return 0
    # mostrar primera diferencia para depurar
    la, lb = na.splitlines(), nb.splitlines()
    for i,(x,y) in enumerate(zip(la, lb)):
        if x != y:
            print(f'DIFERENCIA en línea ~{i+1} (fuera de la zona permitida):')
            print('  A:', x[:160])
            print('  B:', y[:160])
            break
    else:
        print(f'Distinta cantidad de líneas: A={len(la)} B={len(lb)}')
    print('FALLO: A y B difieren fuera de ROOM_DOC/APP. Regenera B desde A.')
    return 1

if __name__ == '__main__':
    sys.exit(main())
