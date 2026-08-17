문명: 감나무뜰의 창세기
GitHub Pages 바로 업로드용 전체 프로젝트

[가장 쉬운 사용법]
1. 이 ZIP을 압축 해제합니다.
2. civilization-game-ready 폴더 안의 파일/폴더를 전부 선택합니다.
3. GitHub 저장소의 최상위(root)에 그대로 업로드합니다.
4. index.html이 반드시 저장소 최상위에 있어야 합니다.
5. GitHub Pages를 main / root 로 설정합니다.
6. 기존 Pages 주소를 새로고침합니다.

[폴더 구조]
index.html
.nojekyll
css/
  styles.css
js/
  game.js
  core/
    state-machine.js
  rpg/
    combat-rules.js
data/
  residents.json
  seed_residents.json
  monsters.json
assets/
  characters/
  monsters/
  buildings/
  textures/
  audio/

[현재 포함된 핵심 기능]
- iPhone/Safari 터치 카메라: 한 손가락 회전, 두 손가락 이동, 핀치 줌
- 내 캐릭터 실제 3D 배치
- 세계력 55년 이후 사용자만 레벨/EXP 사냥 시스템 활성화
- 몬스터 상태머신: 대기 → 감지 → 추적 → 공격 → 스폰 지점 복귀 → 사망/재사용
- 몬스터가 플레이어를 실제 공격
- 플레이어 사망/마을 부활
- 자동 사냥
- 주민 Utility AI: 욕구, 성격, 기억, 관계, 장기목표, 반복행동 패널티
- 인구/세대 성장, 아이 성장
- 하루 단위 문명 경제/기술/건축
- 주택/밭/저장고/작업장/우물/가마/공동부엌/망루/베틀 등
- 오늘의 이야기/연대기/소설 TXT
- 모바일 HUD
- localStorage 자동 저장

[중요]
- Three.js는 index.html의 importmap을 통해 CDN에서 불러옵니다.
- 즉 GitHub Pages에서 인터넷 연결 상태로 실행하는 구조입니다.
- assets 폴더는 이후 GLB/텍스처/오디오를 넣기 위한 자리이며,
  현재 캐릭터/건물/몬스터는 코드로 생성되므로 별도 에셋이 없어도 실행됩니다.
- 다른 공개 RPG 저장소의 코드를 복사한 것이 아니라,
  상태머신/컨트롤러 분리/몬스터 추적·복귀 같은 구조만 참고하여
  이 프로젝트용 JavaScript로 새로 작성했습니다.
