import Script from 'next/script';
import React from 'react'

import { useTranslations } from 'next-intl'

const ChartHUD = (props) => {
  return (
    <>
      <div className="chart-hud-container1">
        <hr className="chart-hud-separator"></hr>
        <div>
          <div className="chart-hud-container3">
            <Script
              html={`<div id="chart-hud" class="w-full h-64"><!-- TODO integrate Recharts --></div>`}
            ></Script>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .chart-hud-container1 {
            width: 100%;
            height: 400px;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .chart-hud-separator {
            width: 100%;
            height: 1px;
            background-color: #595959;
          }
          .chart-hud-container3 {
            display: contents;
          }
        `}
      </style>
    </>
  )
}

export default ChartHUD
