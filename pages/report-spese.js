import React from 'react'
import Head from 'next/head'

import { useTranslations } from 'next-intl'

const ReportSpese = (props) => {
  return (
    <>
      <div className="report-spese-container1">
        <Head>
          <title>Report-spese - Jarvis-Assistent</title>
          <meta property="og:title" content="Report-spese - Jarvis-Assistent" />
        </Head>
        <div className="report-spese-container2"></div>
      </div>
      <style jsx>
        {`
          .report-spese-container1 {
            width: 100%;
            display: flex;
            min-height: 100vh;
            align-items: center;
            flex-direction: column;
            justify-content: center;
          }
          .report-spese-container2 {
            width: 200px;
            height: 100px;
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
        `}
      </style>
    </>
  )
}

export default ReportSpese
