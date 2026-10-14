import { Component, type ErrorInfo, type PropsWithChildren } from 'react';

export class RenderErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('화면 렌더링 오류', error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <main className="auth-page" role="alert">
      <h1>화면을 불러오지 못했습니다.</h1>
      <p>새로고침한 뒤 다시 확인해 주세요.</p>
      <button type="button" onClick={() => window.location.reload()}>새로고침</button>
    </main>;
    return this.props.children;
  }
}
