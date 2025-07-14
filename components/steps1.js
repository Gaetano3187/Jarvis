import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const Steps1 = (props) => {
  return (
    <>
      <div className="steps1-container1 thq-section-padding">
        <div className="steps1-max-width thq-section-max-width">
          <div className="steps1-container2">
            <div className="steps1-container3 thq-card">
              <img
                alt={props.step1ImageAlt}
                src={props.step1ImageSrc}
                className="steps1-image1 thq-img-ratio-1-1"
              />
              <h2 className="thq-heading-2">
                {props.step1Title ?? (
                  <Fragment>
                    <span className="steps1-text25">Heading</span>
                  </Fragment>
                )}
              </h2>
              <span className="steps1-text11 thq-body-small">
                {props.step1Description ?? (
                  <Fragment>
                    <span className="steps1-text27">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse varius enim in eros elementum tristique. Duis
                      cursus, mi quis viverra ornare, eros dolor interdum nulla.
                    </span>
                  </Fragment>
                )}
              </span>
              <label className="steps1-text12 thq-heading-3">01</label>
            </div>
            <div className="steps1-container4 thq-card">
              <img
                alt={props.step2Alt}
                src={props.step2ImageSrc}
                className="steps1-image2 thq-img-ratio-1-1"
              />
              <h2 className="thq-heading-2">
                {props.step2Title ?? (
                  <Fragment>
                    <span className="steps1-text29">Heading</span>
                  </Fragment>
                )}
              </h2>
              <span className="steps1-text14 thq-body-small">
                {props.step2Description ?? (
                  <Fragment>
                    <span className="steps1-text22">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse varius enim in eros elementum tristique. Duis
                      cursus, mi quis viverra ornare, eros dolor interdum nulla.
                    </span>
                  </Fragment>
                )}
              </span>
              <label className="steps1-text15 thq-heading-3">02</label>
            </div>
          </div>
          <div className="steps1-container5">
            <div className="steps1-container6 thq-card">
              <img
                alt={props.step3ImageAlt}
                src={props.step3ImageSrc}
                className="steps1-image3 thq-img-ratio-1-1"
              />
              <h2 className="thq-heading-2">
                {props.step3Title ?? (
                  <Fragment>
                    <span className="steps1-text28">Heading</span>
                  </Fragment>
                )}
              </h2>
              <span className="steps1-text17 thq-body-small">
                {props.step3Description ?? (
                  <Fragment>
                    <span className="steps1-text23">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse varius enim in eros elementum tristique. Duis
                      cursus, mi quis viverra ornare, eros dolor interdum nulla.
                    </span>
                  </Fragment>
                )}
              </span>
              <label className="steps1-text18 thq-heading-3">03</label>
            </div>
            <div className="steps1-container7 thq-card">
              <img
                alt={props.step4ImageAlt}
                src={props.step4ImageSrc}
                className="steps1-image4 thq-img-ratio-1-1"
              />
              <h2 className="thq-heading-2">
                {props.step4Title ?? (
                  <Fragment>
                    <span className="steps1-text26">Heading</span>
                  </Fragment>
                )}
              </h2>
              <span className="steps1-text20 thq-body-small">
                {props.step4Description ?? (
                  <Fragment>
                    <span className="steps1-text24">
                      Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                      Suspendisse varius enim in eros elementum tristique. Duis
                      cursus, mi quis viverra ornare, eros dolor interdum nulla.
                    </span>
                  </Fragment>
                )}
              </span>
              <label className="steps1-text21 thq-heading-3">04</label>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .steps1-container1 {
            width: 100%;
            height: auto;
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
            justify-content: center;
          }
          .steps1-max-width {
            gap: var(--dl-layout-space-unit);
            flex: 0 0 auto;
            width: 100%;
            height: auto;
            display: flex;
            align-items: flex-start;
            flex-direction: row;
          }
          .steps1-container2 {
            gap: var(--dl-layout-space-unit);
            flex: 1;
            display: flex;
            align-items: flex-start;
            flex-direction: row;
          }
          .steps1-container3 {
            flex: 1;
            display: flex;
            position: relative;
            align-items: center;
            flex-direction: column;
            justify-content: center;
            background-color: var(--dl-color-theme-neutral-light);
          }
          .steps1-image1 {
            width: var(--dl-layout-size-large);
            height: var(--dl-layout-size-large);
          }
          .steps1-text11 {
            text-align: center;
          }
          .steps1-text12 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps1-container4 {
            flex: 1;
            display: flex;
            position: relative;
            align-items: center;
            border-radius: var(--dl-layout-radius-cardradius);
            flex-direction: column;
            justify-content: center;
            background-color: var(--dl-color-theme-neutral-light);
          }
          .steps1-image2 {
            width: var(--dl-layout-size-large);
            height: var(--dl-layout-size-large);
          }
          .steps1-text14 {
            text-align: center;
          }
          .steps1-text15 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps1-container5 {
            gap: var(--dl-layout-space-unit);
            flex: 1;
            display: flex;
            align-items: flex-start;
            flex-direction: row;
          }
          .steps1-container6 {
            flex: 1;
            display: flex;
            position: relative;
            align-items: center;
            border-radius: var(--dl-layout-radius-cardradius);
            flex-direction: column;
            justify-content: center;
            background-color: var(--dl-color-theme-neutral-light);
          }
          .steps1-image3 {
            width: var(--dl-layout-size-large);
            height: var(--dl-layout-size-large);
          }
          .steps1-text17 {
            text-align: center;
          }
          .steps1-text18 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps1-container7 {
            flex: 1;
            display: flex;
            position: relative;
            align-items: center;
            border-radius: var(--dl-layout-radius-cardradius);
            flex-direction: column;
            justify-content: center;
            background-color: var(--dl-color-theme-neutral-light);
          }
          .steps1-image4 {
            width: var(--dl-layout-size-large);
            height: var(--dl-layout-size-large);
          }
          .steps1-text20 {
            text-align: center;
          }
          .steps1-text21 {
            top: var(--dl-layout-space-unit);
            right: var(--dl-layout-space-unit);
            position: absolute;
            font-size: 40px;
            font-style: normal;
            font-weight: 700;
          }
          .steps1-text22 {
            display: inline-block;
          }
          .steps1-text23 {
            display: inline-block;
          }
          .steps1-text24 {
            display: inline-block;
          }
          .steps1-text25 {
            display: inline-block;
          }
          .steps1-text26 {
            display: inline-block;
          }
          .steps1-text27 {
            display: inline-block;
          }
          .steps1-text28 {
            display: inline-block;
          }
          .steps1-text29 {
            display: inline-block;
          }
          @media (max-width: 991px) {
            .steps1-max-width {
              flex-direction: column;
            }
          }
          @media (max-width: 767px) {
            .steps1-container2 {
              flex-direction: column;
            }
            .steps1-container3 {
              width: 100%;
            }
            .steps1-container4 {
              width: 100%;
            }
            .steps1-container5 {
              flex-direction: column;
            }
            .steps1-container6 {
              width: 100%;
            }
            .steps1-container7 {
              width: 100%;
            }
          }
        `}
      </style>
    </>
  )
}

Steps1.defaultProps = {
  step1ImageSrc: 'https://play.teleporthq.io/static/svg/default-img.svg',
  step3ImageAlt: 'image',
  step2Description: undefined,
  step3Description: undefined,
  step4Description: undefined,
  step2Alt: 'image',
  step1Title: undefined,
  step4Title: undefined,
  step1Description: undefined,
  step1ImageAlt: 'image',
  step3Title: undefined,
  step4ImageAlt: 'image',
  step4ImageSrc: 'https://play.teleporthq.io/static/svg/default-img.svg',
  step3ImageSrc: 'https://play.teleporthq.io/static/svg/default-img.svg',
  step2ImageSrc: 'https://play.teleporthq.io/static/svg/default-img.svg',
  step2Title: undefined,
}

Steps1.propTypes = {
  step1ImageSrc: PropTypes.string,
  step3ImageAlt: PropTypes.string,
  step2Description: PropTypes.element,
  step3Description: PropTypes.element,
  step4Description: PropTypes.element,
  step2Alt: PropTypes.string,
  step1Title: PropTypes.element,
  step4Title: PropTypes.element,
  step1Description: PropTypes.element,
  step1ImageAlt: PropTypes.string,
  step3Title: PropTypes.element,
  step4ImageAlt: PropTypes.string,
  step4ImageSrc: PropTypes.string,
  step3ImageSrc: PropTypes.string,
  step2ImageSrc: PropTypes.string,
  step2Title: PropTypes.element,
}

export default Steps1
