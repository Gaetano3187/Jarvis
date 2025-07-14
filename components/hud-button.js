import React, { Fragment, useEffect } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const HudButton = (props) => {
  useEffect(() => import('@lottiefiles/lottie-player'), [])
  return (
    <>
      <div className="hud-button-container">
        <div className="hud-button-div1">
          <lottie-player
            src="https://presentation-website-assets.teleporthq.io/features/lottie.json"
            speed="1"
            autoplay="true"
            background="transparent"
          ></lottie-player>
        </div>
        <div className="hud-button-div2">
          <lottie-player
            src="https://presentation-website-assets.teleporthq.io/features/lottie.json"
            speed="1"
            autoplay="true"
            background="transparent"
          ></lottie-player>
        </div>
        <button className="hud-glow button text-hud-900 px-4 rounded bg-hud-cyan py-2">
          <span>
            {props.button ?? (
              <Fragment>
                <span className="hud-button-text2">HUD Button</span>
              </Fragment>
            )}
          </span>
        </button>
      </div>
      <style jsx>
        {`
          .hud-button-container {
            width: 100%;
            height: 400px;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .hud-button-div1 {
            width: 300px;
            height: 300px;
          }
          .hud-button-div2 {
            width: 300px;
            height: 300px;
          }
          .hud-button-text2 {
            display: inline-block;
          }
        `}
      </style>
    </>
  )
}

HudButton.defaultProps = {
  button: undefined,
}

HudButton.propTypes = {
  button: PropTypes.element,
}

export default HudButton
