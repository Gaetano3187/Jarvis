// pages/home.js
import React from 'react';
import withAuth from '../hoc/withAuth';

function Home() {
  return <div style={{padding:20, color:'#fff', background:'#0f172a'}}>Home OK (stub)</div>;
}

export default withAuth(Home);
