import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Steps21 = (props) => {
  return (
    <>
      <div className="steps21-container1 thq-section-padding">
        <div className="steps21-max-width thq-section-max-width">
          <div className="steps21-container2 thq-grid-2">
            <div className="steps21-section-header">
              <h2 className="thq-heading-2">
                Discover the Power of Our Products
              </h2>
              <p className="thq-body-large">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                Suspendisse varius enim in eros elementum tristique. Duis
                cursus, mi quis viverra ornare, eros dolor interdum nulla, ut
                commodo diam libero vitae erat.
              </p>
              <div className="steps21-actions">
                <button className="thq-button-filled thq-button-animated steps21-button">
                  <span className="thq-body-small">Main action</span>
                </button>
              </div>
            </div>
            <div className="steps21-container3">
              <div className="steps21-container4 thq-card">
                <h2 className="thq-heading-2">
                  {props.step1Title ?? (
                    <Fragment>
                      <span className="steps21-text31">Sign Up</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps21-text14 thq-body-small">
                  {props.step1Description ?? (
                    <Fragment>
                      <span className="steps21-text25">
                        Create an account to get started on your journey.
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps21-text15 thq-heading-3">01</label>
              </div>
              <div className="steps21-container5 thq-card">
                <h2 className="thq-heading-2">
                  {props.step2Title ?? (
                    <Fragment>
                      <span className="steps21-text32">Explore</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps21-text17 thq-body-small">
                  {props.step2Description ?? (
                    <Fragment>
                      <span className="steps21-text29">
                        Discover a wide range of products and services tailored
                        for you.
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps21-text18 thq-heading-3">02</label>
              </div>
              <div className="steps21-container6 thq-card">
                <h2 className="thq-heading-2">
                  {props.step3Title ?? (
                    <Fragment>
                      <span className="steps21-text26">Customize</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps21-text20 thq-body-small">
                  {props.step3Description ?? (
                    <Fragment>
                      <span className="steps21-text30">
                        Personalize your experience by selecting preferences and
                        settings.
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps21-text21 thq-heading-3">03</label>
              </div>
              <div className="steps21-container7 thq-card">
                <h2 className="thq-heading-2">
                  {props.step4Title ?? (
                    <Fragment>
                      <span className="steps21-text27">Enjoy</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps21-text23 thq-body-small">
                  {props.step4Description ?? (
                    <Fragment>
                      <span className="steps21-text28">
                        Sit back, relax, and enjoy the benefits of our platform.
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps21-text24 thq-heading-3">04</label>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .steps21-container1 {
            width: 100%;
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
            justify-content: center;
          }
          .steps21-max-width {
            gap: var(--dl-layout-space-fourunits);
            width: 100%;
            display: flex;
            align-items: flex-start;
            flex-direction: row;
          }
          .steps21-container2 {
            align-items: start;
          }
          .steps21-section-header {
            gap: var(--dl-layout-space-oneandhalfunits);
            top: 10%;
            display: flex;
            position: sticky;
            align-items: flex-start;
            flex-direction: column;
          }
          .steps21-actions {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-items: flex-start;
          }
          .steps21-container3 {
            grid-area: span 1 / span 1 / span 1 / span 1;
          }
          .steps21-container4 {
            top: 10%;
            position: sticky;
            transform: rotate(-2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent1);
          }
          .steps21-text14 {
            text-align: center;
          }
          .steps21-text15 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps21-container5 {
            top: 10%;
            position: sticky;
            transform: rotate(2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent2);
          }
          .steps21-text17 {
            text-align: center;
          }
          .steps21-text18 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps21-container6 {
            top: 10%;
            position: sticky;
            transform: rotate(-2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent1);
          }
          .steps21-text20 {
            text-align: center;
          }
          .steps21-text21 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps21-container7 {
            top: 10%;
            position: sticky;
            transform: rotate(2deg);
            background-color: var(--dl-color-theme-accent2);
          }
          .steps21-text23 {
            text-align: center;
          }
          .steps21-text24 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps21-text25 {
            display: inline-block;
          }
          .steps21-text26 {
            display: inline-block;
          }
          .steps21-text27 {
            display: inline-block;
          }
          .steps21-text28 {
            display: inline-block;
          }
          .steps21-text29 {
            display: inline-block;
          }
          .steps21-text30 {
            display: inline-block;
          }
          .steps21-text31 {
            display: inline-block;
          }
          .steps21-text32 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .steps21-max-width {
              flex-direction: column;
            }
          }
          @media (max-width: 767px) {
            .steps21-section-header {
              position: static;
              margin-bottom: var(--dl-layout-space-twounits);
            }
            .steps21-actions {
              width: 100%;
              align-self: flex-start;
            }
            .steps21-container4 {
              width: 100%;
            }
            .steps21-container5 {
              width: 100%;
            }
            .steps21-container6 {
              width: 100%;
            }
            .steps21-container7 {
              width: 100%;
            }
          }
          @media (max-width: 479px) {
            .steps21-button {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

Steps21.defaultProps = {
  step1Description: undefined,
  step3Title: undefined,
  step4Title: undefined,
  step4Description: undefined,
  step2Description: undefined,
  step3Description: undefined,
  step1Title: undefined,
  step2Title: undefined,
}

Steps21.propTypes = {
  step1Description: PropTypes.element,
  step3Title: PropTypes.element,
  step4Title: PropTypes.element,
  step4Description: PropTypes.element,
  step2Description: PropTypes.element,
  step3Description: PropTypes.element,
  step1Title: PropTypes.element,
  step2Title: PropTypes.element,
}

export default Steps21
