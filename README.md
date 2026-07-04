# 어부의 지도 — The Fisherman's Chart

시몬 베드로의 생애의 참된 열네 곳을 걷는 3D 웹 탐험. 갈릴리의 그물에서
로마의 대성당까지 — 청소년을 위한 한국어 인터랙티브 성경 이야기.

A walkable 3D chart of the fourteen true places of Simon Peter's life, from the
nets of Galilee to the basilica in Rome. Built for Korean teenagers, in Korean.

## 조작 / Controls

- **W A S D** 또는 방향키로 걷기 · 드래그로 둘러보기
- **E** 또는 탭하여 장소 방문 · **M** 으로 지도 보기
- 모바일: 왼손 엄지로 걷기, 오른손 엄지로 보기

## 실행 / Run

빌드 과정 없는 정적 사이트입니다. ES 모듈을 쓰므로 반드시 웹서버로 여세요
(`index.html` 더블클릭 ❌).

```
npx serve
```

정적 스택: 순수 Three.js (r160, CDN import-map), Web Audio API로 합성한 소리.
파일 오디오·이미지 에셋 없음.

## 장소 / The fourteen places

그물 · 가버나움의 집 · 물 위를 걷다 · 가이사랴 빌립보(반석) · 겟세마네 ·
첫 번째 불(세 번의 부인) · 골고다(멀찍이서) · 빈 무덤 · 긴 밤 ·
두 번째 불(새벽 바닷가) · 세 번의 물음 · 오순절 · 로마로 가는 항해 ·
거꾸로(바티칸 언덕)
