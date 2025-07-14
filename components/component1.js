import React from 'react'

import { useTranslations } from 'next-intl'

const Component1 = (props) => {
  return (
    <>
      <div className="component1-container"></div>
      <style jsx>
        {`
          .component1-container {
            width: 100%;
            height: 400px;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
        `}
      </style>
    </>
  )
}

export default Component1
