import React from 'react';
import Head from 'next/head';
import Home from '../ui/Home';

export default function HomePage() {
  return (
    <React.Fragment>
      <Head>
        <title>Home - Nextron (with-tailwindcss)</title>
      </Head>
      <Home />
    </React.Fragment>
  );
}
