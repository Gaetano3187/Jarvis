import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Steps22 = (props) => {
  return (
    <>
      <div className="steps22-container1 thq-section-padding">
        <div className="steps22-max-width thq-section-max-width">
          <div className="steps22-container2 thq-grid-2">
            <div className="steps22-section-header">
              <h2 className="thq-heading-2">
                Discover the Power of Our Products
              </h2>
              <p className="thq-body-large">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                Suspendisse varius enim in eros elementum tristique. Duis
                cursus, mi quis viverra ornare, eros dolor interdum nulla, ut
                commodo diam libero vitae erat.
              </p>
              <div className="steps22-actions">
                <button className="thq-button-filled thq-button-animated steps22-button">
                  <span className="thq-body-small">Main action</span>
                </button>
              </div>
            </div>
            <div className="steps22-container3">
              <div className="steps22-container4 thq-card">
                <h2 className="thq-heading-2">
                  {props.step1Title ?? (
                    <Fragment>
                      <span className="steps22-text27">Sign Up</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps22-text14 thq-body-small">
                  {props.step1Description ?? (
                    <Fragment>
                      <span className="steps22-text29">
                        Create an account to get started on our platform
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps22-text15 thq-heading-3">01</label>
              </div>
              <div className="steps22-container5 thq-card">
                <h2 className="thq-heading-2">
                  {props.step2Title ?? (
                    <Fragment>
                      <span className="steps22-text30">Explore</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps22-text17 thq-body-small">
                  {props.step2Description ?? (
                    <Fragment>
                      <span className="steps22-text32">
                        Discover a wide range of features and services available
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps22-text18 thq-heading-3">02</label>
              </div>
              <div className="steps22-container6 thq-card">
                <h2 className="thq-heading-2">
                  {props.step3Title ?? (
                    <Fragment>
                      <span className="steps22-text26">Engage</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps22-text20 thq-body-small">
                  {props.step3Description ?? (
                    <Fragment>
                      <span className="steps22-text31">
                        Interact with other users and participate in discussions
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps22-text21 thq-heading-3">03</label>
              </div>
              <div className="steps22-container7 thq-card">
                <h2 className="thq-heading-2">
                  {props.step4Title ?? (
                    <Fragment>
                      <span className="steps22-text25">Enjoy</span>
                    </Fragment>
                  )}
                </h2>
                <span className="steps22-text23 thq-body-small">
                  {props.step4Description ?? (
                    <Fragment>
                      <span className="steps22-text28">
                        Make the most out of your experience and enjoy all the
                        benefits
                      </span>
                    </Fragment>
                  )}
                </span>
                <label className="steps22-text24 thq-heading-3">04</label>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .steps22-container1 {
            width: 100%;
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
            justify-content: center;
          }
          .steps22-max-width {
            gap: var(--dl-layout-space-fourunits);
            width: 100%;
            display: flex;
            align-items: flex-start;
            flex-direction: row;
          }
          .steps22-container2 {
            align-items: start;
          }
          .steps22-section-header {
            gap: var(--dl-layout-space-oneandhalfunits);
            top: 10%;
            display: flex;
            position: sticky;
            align-items: flex-start;
            flex-direction: column;
          }
          .steps22-actions {
            gap: var(--dl-layout-space-unit);
            display: flex;
            align-items: flex-start;
          }
          .steps22-container3 {
            grid-area: span 1 / span 1 / span 1 / span 1;
          }
          .steps22-container4 {
            top: 10%;
            position: sticky;
            transform: rotate(-2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent1);
          }
          .steps22-text14 {
            text-align: center;
          }
          .steps22-text15 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps22-container5 {
            top: 10%;
            position: sticky;
            transform: rotate(2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent2);
          }
          .steps22-text17 {
            text-align: center;
          }
          .steps22-text18 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps22-container6 {
            top: 10%;
            position: sticky;
            transform: rotate(-2deg);
            margin-bottom: var(--dl-layout-space-twounits);
            background-color: var(--dl-color-theme-accent1);
          }
          .steps22-text20 {
            text-align: center;
          }
          .steps22-text21 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps22-container7 {
            top: 10%;
            position: sticky;
            transform: rotate(2deg);
            background-color: var(--dl-color-theme-accent2);
          }
          .steps22-text23 {
            text-align: center;
          }
          .steps22-text24 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps22-text25 {
            display: inline-block;
          }
          .steps22-text26 {
            display: inline-block;
          }
          .steps22-text27 {
            display: inline-block;
          }
          .steps22-text28 {
            display: inline-block;
          }
          .steps22-text29 {
            display: inline-block;
          }
          .steps22-text30 {
            display: inline-block;
          }
          .steps22-text31 {
            display: inline-block;
          }
          .steps22-text32 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .steps22-max-width {
              flex-direction: column;
            }
          }
          @media (max-width: 767px) {
            .steps22-section-header {
              position: static;
              margin-bottom: var(--dl-layout-space-twounits);
            }
            .steps22-actions {
              width: 100%;
              align-self: flex-start;
            }
            .steps22-container4 {
              width: 100%;
            }
            .steps22-container5 {
              width: 100%;
            }
            .steps22-container6 {
              width: 100%;
            }
            .steps22-container7 {
              width: 100%;
            }
          }
          @media (max-width: 479px) {
            .steps22-button {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

Steps22.defaultProps = {
  step4Title: undefined,
  step3Title: undefined,
  step1Title: undefined,
  step4Description: undefined,
  step1Description: undefined,
  step2Title: undefined,
  step3Description: undefined,
  step2Description: undefined,
}

Steps22.propTypes = {
  step4Title: PropTypes.element,
  step3Title: PropTypes.element,
  step1Title: PropTypes.element,
  step4Description: PropTypes.element,
  step1Description: PropTypes.element,
  step2Title: PropTypes.element,
  step3Description: PropTypes.element,
  step2Description: PropTypes.element,
}

export default Steps22
