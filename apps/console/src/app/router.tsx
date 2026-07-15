import { createBrowserRouter } from "react-router-dom";
import { IngestionReviewPage } from "../features/ingestion/ingestion-review-page";
import { ImportPage } from "../features/ingestion/import-page";
import { ConceptDetailPage } from "../features/library/concept-detail-page";
import { LibraryPage } from "../features/library/library-page";
import { ReviewPage } from "../features/review/review-page";
import { SearchPage } from "../features/search/search-page";
import { SettingsPage } from "../features/settings/settings-page";
import { AppShell } from "./app-shell";

export const routes = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <ImportPage /> },
      { path: "ingestions/:sessionId", element: <IngestionReviewPage /> },
      { path: "library", element: <LibraryPage /> },
      { path: "concepts/:conceptId", element: <ConceptDetailPage /> },
      { path: "review", element: <ReviewPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
