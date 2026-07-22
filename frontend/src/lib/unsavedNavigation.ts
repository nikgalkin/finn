export const UNSAVED_NAVIGATION_REQUEST_EVENT = 'finn:unsaved-navigation-request';

export type UnsavedNavigationRequestDetail = {
  route: string;
};

export const requestUnsavedNavigation = (route: string) => {
  window.dispatchEvent(new CustomEvent<UnsavedNavigationRequestDetail>(UNSAVED_NAVIGATION_REQUEST_EVENT, {
    detail: { route }
  }));
};
