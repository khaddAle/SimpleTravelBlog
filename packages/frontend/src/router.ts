import type { RouteDefinition } from 'svelte-spa-router';
import Landing from './pages/Landing.svelte';
import Post from './pages/Post.svelte';
import Archive from './pages/Archive.svelte';
import MapPage from './pages/MapPage.svelte';
import Search from './pages/Search.svelte';
import NotFound from './pages/NotFound.svelte';
import Login from './admin/Login.svelte';
import PostList from './admin/PostList.svelte';
import PostEditor from './admin/PostEditor.svelte';
import ImageLibrary from './admin/ImageLibrary.svelte';
import Users from './admin/Users.svelte';
import Settings from './admin/Settings.svelte';

/** Hash routes (svelte-spa-router). German slugs; admin under /admin. */
export const routes: RouteDefinition = {
  '/': Landing,
  '/beitrag/:id': Post,
  '/archiv': Archive,
  '/karte': MapPage,
  '/suche': Search,

  '/login': Login,
  '/admin': PostList,
  '/admin/neu': PostEditor,
  '/admin/beitrag/:id': PostEditor,
  '/admin/bilder': ImageLibrary,
  '/admin/nutzer': Users,
  '/admin/einstellungen': Settings,

  '*': NotFound,
};
