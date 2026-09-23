# 지온과 사라진 생일별 — iPad 그림책

생일 축하 메시지와 26쪽 그림 이야기를 iPad에서 실제 책처럼 넘겨 보는 정적 웹앱입니다.

## 실행

```powershell
npm start
```

브라우저에서 `http://localhost:4173`을 엽니다. 같은 Wi-Fi의 iPad에서 보려면 PC의 로컬 IP 뒤에 `:4173`을 붙여 접속합니다.

구성과 로컬 서버를 한 번에 확인하려면 서버를 켠 상태에서 다른 터미널로 다음 명령을 실행합니다.

```powershell
npm test
```

Playwright가 설치된 환경에서는 27쪽을 세 가지 iPad 화면 크기로 실제 렌더링해 글 영역 침범 여부와 스크린샷을 확인할 수 있습니다.

```powershell
npm run test:playwright
```

본문은 모든 페이지에서 `Pretendard` 20px로 통일되어 있습니다.

## GitHub Pages 배포

`main` 브랜치에 푸시하면 `.github/workflows/deploy-pages.yml`이 정적 사이트를 만들고 GitHub Pages에 자동 배포합니다.

## 조작

- 화면 오른쪽 탭 또는 왼쪽 스와이프: 다음 쪽
- 화면 왼쪽 탭 또는 오른쪽 스와이프: 이전 쪽
- 좌우 화살표 버튼과 하단 슬라이더로도 이동 가능
- 오른쪽 위 버튼: 전체 화면 또는 집중 모드
- 키보드: `←`, `→`, `Home`, `End`, `Space`

## iPad 홈 화면에 추가

Safari의 공유 버튼을 누른 뒤 **홈 화면에 추가**를 선택하면 앱처럼 열 수 있습니다. 한 번 읽은 그림은 오프라인 캐시에 저장됩니다.

## 원고·그림 다시 동기화

상위 프로젝트의 `storybook_pdf/opening_scenes_v1` 이미지나 원고를 수정한 뒤 실행합니다.

```powershell
python scripts/sync_story.py
```

원본 PNG는 iPad 로딩에 맞춘 고화질 JPEG로 변환되며 `story-data.js`가 갱신됩니다.

## 어린이용 터치 보호

- 확대/축소 뷰포트 잠금
- 두 손가락 핀치와 더블 탭 확대 방지
- 텍스트 선택, 길게 누르기 호출 메뉴, 이미지 드래그, 복사·붙여넣기 방지
- 한 손가락 탭과 페이지 스와이프 유지
- 모든 주요 버튼은 44px 이상의 터치 영역 사용
- 성인용 입력이 추가될 경우 `[data-adult-control]` 속성을 붙이면 선택과 클립보드를 허용할 수 있음
