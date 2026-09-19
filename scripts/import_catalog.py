"""Import every FireRoad course and requirement tree; fail rather than publish partial data."""
import concurrent.futures
import datetime
import json
from pathlib import Path
import subprocess

BASE = 'https://fireroad.mit.edu'
OUT = Path(__file__).resolve().parents[1] / 'public' / 'data'

def fetch(path):
    return json.loads(subprocess.check_output(['curl', '-fsSL', '--retry', '2', '--max-time', '60', BASE + path]))

def main():
    courses = fetch('/courses/all?full=true')
    metadata = fetch('/requirements/list_reqs')
    assert isinstance(courses, list) and courses
    assert all(c.get('subject_id') for c in courses)
    for course in courses:
        if not course.get('title'):
            course['title'] = 'Title unavailable in source'
    assert len({c['subject_id'] for c in courses}) == len(courses)
    def requirement(key):
        return key, fetch('/requirements/get_json/' + key)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        requirements = dict(pool.map(requirement, metadata))
    OUT.mkdir(parents=True, exist_ok=True)
    payloads = {'catalog': courses, 'requirements': requirements,
                'manifest': {'source': BASE, 'importedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                             'courseCount': len(courses), 'requirementCount': len(requirements)}}
    for name, data in payloads.items():
        path = OUT / (name + '.json')
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
        temp.replace(path)
    print(f'Imported {len(courses)} courses and {len(requirements)} requirement trees.')

if __name__ == '__main__':
    main()
